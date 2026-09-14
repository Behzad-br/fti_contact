"""Teacher notes upload + lock/unlock; students only receive watermarked page images."""
from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.homework.controllers import get_student_id, require_teacher
from app.notes.documents import (
    ALLOWED_LABEL,
    extension_of,
    file_kind,
    inspect_document,
    is_allowed_filename,
    media_type_for,
    render_page,
)
from app.notes.models import ClassNote
from app.notes.seed import ensure_sample_note

router = APIRouter()

MAX_NOTE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
inspect_pdf = inspect_document


def _notes_dir() -> Path:
    dest = Path(settings.NOTES_DIR)
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def _note_path(note: ClassNote) -> Path:
    return _notes_dir() / note.stored_name


def _public(note: ClassNote, unlocked: Optional[bool] = None) -> dict:
    kind = file_kind(note.original_name or note.stored_name)
    return {
        "id": note.id,
        "title": note.title,
        "description": note.description or "",
        "original_name": note.original_name,
        "kind": kind,
        "page_count": note.page_count,
        "unlocked_batches": note.unlocked_batches,
        "unlocked_student_ids": note.unlocked_student_ids,
        "unlocked": unlocked,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "updated_at": note.updated_at.isoformat() if note.updated_at else None,
    }


def student_aliases(student_id: str) -> set[str]:
    key = (student_id or "").strip().lower()
    ids = {key} if key else set()
    if key in {"local", "s1", "ali.ahmad"}:
        ids.update({"local", "s1", "ali.ahmad"})
    return {item for item in ids if item}


def student_can_read(note: ClassNote, student_id: str, batch: str) -> bool:
    aliases = student_aliases(student_id)
    unlocked_ids = {item.strip().lower() for item in note.unlocked_student_ids if item}
    if aliases & unlocked_ids:
        return True
    batch_key = (batch or "").strip().lower()
    return bool(batch_key) and batch_key in {item.strip().lower() for item in note.unlocked_batches if item}


async def _save_file(file: UploadFile) -> tuple[str, str, int]:
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(raw) > MAX_NOTE_BYTES:
        raise HTTPException(400, f"File must be under {settings.MAX_UPLOAD_SIZE_MB} MB.")
    name = file.filename or "notes.txt"
    if not is_allowed_filename(name):
        raise HTTPException(400, f"Upload a document ({ALLOWED_LABEL}). Executables are not allowed.")
    ext = extension_of(name)
    stored = f"{uuid.uuid4().hex}{ext}"
    path = _notes_dir() / stored
    path.write_bytes(raw)
    try:
        pages = inspect_document(path)
    except Exception:
        pages = 1
    return name, stored, max(1, pages)


@router.post("/notes/teacher")
async def create_note(
    title: str = Form(...),
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_teacher),
):
    title = title.strip()
    if len(title) < 2:
        raise HTTPException(400, "Enter a notes title.")
    original, stored, pages = await _save_file(file)
    note = ClassNote(
        title=title,
        description=description.strip(),
        original_name=original,
        stored_name=stored,
        page_count=pages,
        created_by="teacher",
    )
    note.unlocked_batches = []
    note.unlocked_student_ids = []
    db.add(note)
    db.commit()
    db.refresh(note)
    return _public(note, unlocked=False)


@router.get("/notes/teacher")
async def list_teacher_notes(db: Session = Depends(get_db), _: str = Depends(require_teacher)):
    ensure_sample_note(db)
    rows = db.query(ClassNote).order_by(ClassNote.updated_at.desc()).all()
    return {"notes": [_public(row) for row in rows]}


@router.put("/notes/teacher/{note_id}")
async def update_note(
    note_id: str,
    title: str = Form(...),
    description: str = Form(""),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    _: str = Depends(require_teacher),
):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    title = title.strip()
    if len(title) < 2:
        raise HTTPException(400, "Enter a notes title.")
    note.title = title
    note.description = description.strip()
    note.updated_at = datetime.utcnow()
    if file and file.filename:
        original, stored, pages = await _save_file(file)
        old = _note_path(note)
        if old.exists():
            old.unlink()
        note.original_name = original
        note.stored_name = stored
        note.page_count = pages
    db.commit()
    db.refresh(note)
    return _public(note)


@router.put("/notes/teacher/{note_id}/access")
async def set_note_access(
    note_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _: str = Depends(require_teacher),
):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    batches = body.get("unlocked_batches") or []
    students = body.get("unlocked_student_ids") or []
    if not isinstance(batches, list) or not isinstance(students, list):
        raise HTTPException(400, "Access lists must be arrays.")
    note.unlocked_batches = [str(item).strip() for item in batches if str(item).strip()]
    note.unlocked_student_ids = [str(item).strip() for item in students if str(item).strip()]
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return _public(note)


@router.delete("/notes/teacher/{note_id}")
async def delete_note(note_id: str, db: Session = Depends(get_db), _: str = Depends(require_teacher)):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    path = _note_path(note)
    db.delete(note)
    db.commit()
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.get("/notes/teacher/{note_id}/file")
async def teacher_file(note_id: str, db: Session = Depends(get_db), _: str = Depends(require_teacher)):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    path = _note_path(note)
    if not path.exists():
        raise HTTPException(404, "File is missing.")
    return FileResponse(
        path,
        media_type=media_type_for(note.original_name or note.stored_name),
        filename=note.original_name,
        content_disposition_type="inline",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/notes/student")
async def list_student_notes(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
    x_student_batch: Optional[str] = Header(default="", alias="X-Student-Batch"),
):
    ensure_sample_note(db)
    rows = db.query(ClassNote).order_by(ClassNote.updated_at.desc()).all()
    return {
        "notes": [
            {
                "id": row.id,
                "title": row.title,
                "description": row.description or "",
                "page_count": row.page_count if student_can_read(row, student_id, x_student_batch or "") else None,
                "kind": file_kind(row.original_name or row.stored_name),
                "unlocked": student_can_read(row, student_id, x_student_batch or ""),
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    }


@router.get("/notes/student/{note_id}")
async def student_note_meta(
    note_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
    x_student_batch: Optional[str] = Header(default="", alias="X-Student-Batch"),
    x_student_name: Optional[str] = Header(default="", alias="X-Student-Name"),
):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    if not student_can_read(note, student_id, x_student_batch or ""):
        raise HTTPException(403, "These notes are locked. Ask your teacher to unlock them.")
    return {
        **_public(note, unlocked=True),
        "watermark": f"{(x_student_name or student_id).strip() or student_id} · view only",
    }


@router.get("/notes/student/{note_id}/page/{page_number}")
async def student_note_page(
    note_id: str,
    page_number: int,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
    x_student_batch: Optional[str] = Header(default="", alias="X-Student-Batch"),
    x_student_name: Optional[str] = Header(default="", alias="X-Student-Name"),
):
    note = db.query(ClassNote).filter(ClassNote.id == note_id).first()
    if not note:
        raise HTTPException(404, "Notes not found.")
    if not student_can_read(note, student_id, x_student_batch or ""):
        raise HTTPException(403, "These notes are locked. Ask your teacher to unlock them.")
    path = _note_path(note)
    if not path.exists():
        raise HTTPException(404, "File is missing.")
    mark = f"{(x_student_name or student_id).strip() or student_id}  ·  {student_id}  ·  VIEW ONLY"
    try:
        png = render_page(path, page_number, mark)
    except IndexError:
        raise HTTPException(404, "Page not found.")
    except Exception as exc:
        raise HTTPException(500, f"Could not open this page: {exc}") from exc
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline; filename=notes-page.png",
            "X-Frame-Options": "DENY",
        },
    )
