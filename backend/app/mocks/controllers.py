"""Isolated mock exam API. Existing homework/practice routes stay untouched."""
from __future__ import annotations

import json
import logging
import mimetypes
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.deps import resolve_student_keys as get_student_keys
from app.auth.deps import resolve_teacher_id as get_teacher_id
from app.config import settings
from app.database import get_db
from app.homework.controllers import _open_skill, require_teacher
from app.mocks.models import (
    LmsNotification,
    MockAnswer,
    MockAssignment,
    MockAssignmentStudent,
    MockAttempt,
    MockIntegrityEvent,
    MockLibraryItem,
    TeacherMockAction,
)
from app.mocks.seed import ensure_library

logger = logging.getLogger(__name__)
router = APIRouter()

_MOCK_IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


def _mock_image_dir() -> Path:
    path = Path(settings.READING_DIAGRAM_DIR).parent / "mock_images"
    path.mkdir(parents=True, exist_ok=True)
    return path


@router.post("/mocks/teacher/upload-image")
async def upload_mock_image(file: UploadFile = File(...), _: str = Depends(require_teacher)):
    suffix = Path(file.filename or "image.png").suffix.lower() or ".png"
    if suffix not in _MOCK_IMAGE_TYPES:
        raise HTTPException(400, "Use PNG, JPG, WEBP, GIF, or SVG.")
    name = f"{uuid.uuid4().hex[:12]}{suffix}"
    dest = _mock_image_dir() / name
    dest.write_bytes(await file.read())
    return {"filename": name, "url": f"/api/mocks/images/{name}"}


@router.get("/mocks/images/{filename}")
async def mock_image(filename: str):
    safe = Path(filename).name
    path = _mock_image_dir() / safe
    if not path.is_file() or path.suffix.lower() not in _MOCK_IMAGE_TYPES:
        raise HTTPException(404, "Image not found.")
    media = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=media)


def _enabled():
    if not getattr(settings, "ENABLE_LIVE_MOCK_MONITORING", True):
        raise HTTPException(404, "Mock exams are disabled.")


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(400, "Invalid date.")


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() + "Z" if value else None


def _log_action(db: Session, teacher_id: str, action: str, assignment_id=None, attempt_id=None, payload=None):
    db.add(
        TeacherMockAction(
            teacher_id=teacher_id,
            assignment_id=assignment_id,
            attempt_id=attempt_id,
            action=action,
            payload_json=json.dumps(payload or {}),
        )
    )


def _notify(db: Session, user_id: str, title: str, body: str, href: str):
    db.add(LmsNotification(user_id=user_id, role="student", title=title, body=body, href=href))


def _library_public(row: MockLibraryItem) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "mock_type": row.mock_type,
        "ielts_type": row.ielts_type,
        "question_count": row.question_count,
        "duration_minutes": row.duration_minutes,
        "paper_refs": row.paper_refs,
    }


def _assignment_public(row: MockAssignment, extra: Optional[dict] = None) -> dict:
    data = {
        "id": row.id,
        "library_item_id": row.library_item_id,
        "title": row.title,
        "mock_type": row.mock_type,
        "ielts_type": row.ielts_type,
        "assign_mode": row.assign_mode,
        "batch_id": row.batch_id,
        "batch_label": row.batch_label,
        "available_at": _iso(row.available_at),
        "deadline_at": _iso(row.deadline_at),
        "duration_minutes": row.duration_minutes,
        "attempts_allowed": row.attempts_allowed,
        "secure_mode": bool(row.secure_mode),
        "screen_monitoring": bool(row.screen_monitoring),
        "fullscreen_required": bool(row.fullscreen_required),
        "allow_late_start": bool(row.allow_late_start),
        "auto_submit": bool(row.auto_submit),
        "paper_source": getattr(row, "paper_source", None) or "bank",
        "result_mode": getattr(row, "result_mode", None) or "teacher",
        "instructions": row.instructions,
        "created_by": row.created_by,
        "created_at": _iso(row.created_at),
    }
    if extra:
        data.update(extra)
    return data


def _inbox_status(now: datetime, row: MockAssignment, slot: MockAssignmentStudent, attempt: Optional[MockAttempt]) -> str:
    if slot.cancelled:
        return "cancelled"
    if attempt and attempt.published:
        return "results"
    if attempt and attempt.status in ("submitted", "reviewed"):
        return "completed"
    if attempt and attempt.status == "in_progress":
        return "in_progress"
    available = slot.available_at or row.available_at
    deadline = slot.deadline_at or row.deadline_at
    if available and now < available:
        return "upcoming"
    if deadline and now > deadline and not row.allow_late_start:
        return "closed"
    return "available"


def _find_slot(db: Session, assignment_id: str, keys: list[str]) -> Optional[MockAssignmentStudent]:
    return (
        db.query(MockAssignmentStudent)
        .filter(
            MockAssignmentStudent.assignment_id == assignment_id,
            MockAssignmentStudent.student_id.in_(keys),
        )
        .first()
    )


def _owned(row: MockAssignment, teacher_id: str) -> bool:
    return (row.created_by or "teacher") == (teacher_id or "teacher")


def _attempt_remaining(attempt: MockAttempt, slot: MockAssignmentStudent, row: MockAssignment, now: Optional[datetime] = None) -> int:
    now = now or datetime.utcnow()
    duration = int((slot.duration_minutes or row.duration_minutes or 60) * 60)
    if attempt.paused:
        return max(0, int(attempt.remaining_seconds or 0))
    started = attempt.started_at or now
    elapsed = max(0, int((now - started).total_seconds()))
    return max(0, duration - elapsed)


def _live_status(now: datetime, row: MockAssignment, slot: MockAssignmentStudent, attempt: Optional[MockAttempt]) -> str:
    status = _inbox_status(now, row, slot, attempt)
    if status == "in_progress" and attempt and attempt.last_seen_at:
        if (now - attempt.last_seen_at).total_seconds() > 45:
            return "disconnected"
    return status


def _student_payload(now: datetime, row: MockAssignment, slot: MockAssignmentStudent, attempt: Optional[MockAttempt]) -> dict:
    remaining = _attempt_remaining(attempt, slot, row, now) if attempt else None
    return {
        "id": slot.id,
        "student_id": slot.student_id,
        "student_name": slot.student_name or slot.student_id,
        "status": _live_status(now, row, slot, attempt),
        "duration_minutes": slot.duration_minutes or row.duration_minutes,
        "cancelled": bool(slot.cancelled),
        "flagged": bool(slot.flagged),
        "attempt_id": attempt.id if attempt else None,
        "warning_count": attempt.warning_count if attempt else 0,
        "current_section": attempt.current_section if attempt else None,
        "current_question": attempt.current_question if attempt else None,
        "question_total": attempt.question_total if attempt else None,
        "remaining_seconds": remaining,
        "listening_band": attempt.listening_band if attempt else None,
        "reading_band": attempt.reading_band if attempt else None,
        "writing_band": attempt.writing_band if attempt else None,
        "speaking_band": attempt.speaking_band if attempt else None,
        "overall_band": attempt.overall_band if attempt else None,
        "published": bool(attempt.published) if attempt else False,
        "last_seen_at": _iso(attempt.last_seen_at) if attempt else None,
        "paused": bool(attempt.paused) if attempt else False,
        "screen_sharing": bool(getattr(attempt, "screen_share_active", False)) if attempt else False,
        "connection": "disconnected" if _live_status(now, row, slot, attempt) == "disconnected" else ("stable" if attempt and attempt.status == "in_progress" else "offline"),
        "last_warning": getattr(attempt, "last_warning", None) if attempt else None,
        "livekit_identity": f"student-{slot.student_id}",
    }


def _start_payload(attempt: MockAttempt, row: MockAssignment) -> dict:
    return {
        "attempt_id": attempt.id,
        "skill": attempt.skill_ref,
        "remaining_seconds": attempt.remaining_seconds,
        "screen_monitoring": bool(row.screen_monitoring),
        "fullscreen_required": bool(row.fullscreen_required),
        "auto_submit": bool(row.auto_submit),
        "title": row.title,
        "current_section": attempt.current_section,
        "assignment_id": row.id,
        "secure_mode": bool(row.secure_mode),
    }


def _module_for(mock_type: str) -> str:
    if mock_type in ("reading", "listening", "writing", "speaking"):
        return mock_type
    if mock_type == "full":
        return "reading"
    return "writing"


@router.get("/mocks/flag")
async def mock_flag():
    return {"enabled": bool(getattr(settings, "ENABLE_LIVE_MOCK_MONITORING", True))}


@router.get("/mocks/library")
async def list_library(db: Session = Depends(get_db), _: str = Depends(require_teacher)):
    _enabled()
    ensure_library(db)
    rows = db.query(MockLibraryItem).order_by(MockLibraryItem.title.asc()).all()
    return {"items": [_library_public(row) for row in rows]}


@router.post("/mocks/assignments")
async def create_assignment(
    body: dict,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    ensure_library(db)
    students = body.get("students") or []
    if not isinstance(students, list) or not students:
        raise HTTPException(400, "Select at least one enrolled student.")
    library = None
    if body.get("library_item_id"):
        library = db.query(MockLibraryItem).filter_by(id=body["library_item_id"]).first()
    mock_type = body.get("mock_type") or (library.mock_type if library else "reading")
    ielts_type = body.get("ielts_type") or (library.ielts_type if library else "academic")
    title = (body.get("title") or (library.title if library else "IELTS Mock")).strip()
    if not title:
        raise HTTPException(400, "Mock name is required.")
    duration = int(body.get("duration_minutes") or (library.duration_minutes if library else 60) or 60)
    paper_source = (body.get("paper_source") or ("manual" if body.get("manual") else "bank")).strip().lower()
    if paper_source not in {"bank", "manual"}:
        paper_source = "bank"
    result_mode = (body.get("result_mode") or "teacher").strip().lower()
    if result_mode not in {"teacher", "ai"}:
        result_mode = "teacher"
    refs = dict((library.paper_refs if library else {}) or {})
    refs.update(body.get("paper_refs") or {})
    if paper_source == "manual":
        if mock_type == "writing" and not refs.get("prompt") and not refs.get("question_id") and not refs.get("task1_id"):
            raise HTTPException(400, "Add a writing prompt for this manual mock.")
        if mock_type == "reading" and not (
            refs.get("passage")
            or refs.get("paragraphs")
            or refs.get("passages")
            or refs.get("snapshot")
            or refs.get("reading_test_id")
            or refs.get("test_id")
        ):
            raise HTTPException(400, "Add a reading passage (and questions) for this manual mock.")
        if mock_type == "listening" and not refs.get("questions") and not refs.get("listening_test_id") and not refs.get("test_id"):
            raise HTTPException(400, "Add listening questions for this manual mock.")
        if mock_type == "speaking" and not refs.get("prompt") and not refs.get("speaking_test_id") and not refs.get("test_id"):
            raise HTTPException(400, "Add a speaking prompt for this manual mock.")
        if mock_type == "full":
            raise HTTPException(400, "Manual create supports one skill at a time. Pick Reading, Listening, Writing or Speaking.")
    elif paper_source == "bank" and not library and not refs:
        # Keep older assign payloads working: attach first available bank papers for the skill.
        from app.mocks.seed import _paper_refs_for

        refs = _paper_refs_for(mock_type if mock_type != "full" else "reading", ielts_type, db)
        if not refs and mock_type not in {"custom"}:
            raise HTTPException(400, "Pick a paper from the mock library or create a manual mock.")
    row = MockAssignment(
        library_item_id=library.id if library else None,
        title=title,
        mock_type=mock_type,
        ielts_type=ielts_type,
        assign_mode=body.get("assign_mode") or "batch",
        batch_id=body.get("batch_id"),
        batch_label=body.get("batch_label"),
        available_at=_parse_dt(body.get("available_at")),
        deadline_at=_parse_dt(body.get("deadline_at")),
        duration_minutes=max(1, duration),
        attempts_allowed=max(1, int(body.get("attempts_allowed") or 1)),
        secure_mode=bool(body.get("secure_mode")),
        screen_monitoring=bool(body.get("screen_monitoring")),
        fullscreen_required=bool(body.get("fullscreen_required")),
        allow_late_start=bool(body.get("allow_late_start", True)),
        auto_submit=bool(body.get("auto_submit", True)),
        paper_source=paper_source,
        result_mode=result_mode,
        instructions=body.get("instructions") or "",
        created_by=teacher_id,
    )
    row.paper_refs = refs
    db.add(row)
    db.flush()
    seen = set()
    for item in students:
        sid = str((item or {}).get("id") or "").strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        db.add(
            MockAssignmentStudent(
                assignment_id=row.id,
                student_id=sid,
                student_name=(item or {}).get("name"),
                duration_minutes=duration,
                available_at=row.available_at,
                deadline_at=row.deadline_at,
            )
        )
        start_label = row.available_at.strftime("%d %B %Y %H:%M") if row.available_at else "when available"
        _notify(
            db,
            sid,
            "NEW MOCK ASSIGNED",
            f"{title}\nTeacher: {body.get('teacher_name') or teacher_id}\nDate: {start_label}\nDuration: {duration} minutes",
            f"/student/mocks/{row.id}",
        )
    _log_action(db, teacher_id, "assign", assignment_id=row.id, payload={"count": len(seen)})
    db.commit()
    db.refresh(row)
    return _assignment_public(row, extra={"assigned": len(seen)})


@router.get("/mocks/assignments")
async def list_assignments(
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    rows = (
        db.query(MockAssignment)
        .filter(MockAssignment.created_by == teacher_id)
        .order_by(MockAssignment.created_at.desc())
        .all()
    )
    out = []
    for row in rows:
        slots = db.query(MockAssignmentStudent).filter_by(assignment_id=row.id).all()
        attempts = db.query(MockAttempt).filter_by(assignment_id=row.id).all()
        submitted = len([a for a in attempts if a.status in ("submitted", "reviewed") or a.published])
        out.append(_assignment_public(row, extra={"assigned": len(slots), "submitted": submitted}))
    return {"assignments": out}


@router.get("/mocks/assignments/{assignment_id}/students")
async def assignment_students(
    assignment_id: str,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    row = db.query(MockAssignment).filter_by(id=assignment_id).first()
    if not row or not _owned(row, teacher_id):
        raise HTTPException(404, "Assignment not found.")
    slots = db.query(MockAssignmentStudent).filter_by(assignment_id=assignment_id).all()
    attempts = {a.student_id: a for a in db.query(MockAttempt).filter_by(assignment_id=assignment_id).all()}
    now = datetime.utcnow()
    students = [_student_payload(now, row, slot, attempts.get(slot.student_id)) for slot in slots]
    return {"assignment": _assignment_public(row), "students": students}


@router.patch("/mocks/assignment-students/{slot_id}")
async def patch_slot(
    slot_id: str,
    body: dict,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    slot = db.query(MockAssignmentStudent).filter_by(id=slot_id).first()
    if not slot:
        raise HTTPException(404, "Student assignment not found.")
    assignment = db.query(MockAssignment).filter_by(id=slot.assignment_id).first()
    if assignment and not _owned(assignment, teacher_id):
        raise HTTPException(404, "Student assignment not found.")
    if "duration_minutes" in body and body["duration_minutes"] is not None:
        slot.duration_minutes = max(1, int(body["duration_minutes"]))
    if "add_minutes" in body and body["add_minutes"]:
        slot.duration_minutes = (slot.duration_minutes or 60) + int(body["add_minutes"])
        attempt = (
            db.query(MockAttempt)
            .filter_by(assignment_student_id=slot.id)
            .order_by(MockAttempt.started_at.desc())
            .first()
        )
        if attempt and attempt.remaining_seconds is not None:
            attempt.remaining_seconds += int(body["add_minutes"]) * 60
    if "available_at" in body:
        slot.available_at = _parse_dt(body.get("available_at"))
    if "deadline_at" in body:
        slot.deadline_at = _parse_dt(body.get("deadline_at"))
    if body.get("cancelled") is True:
        slot.cancelled = True
        slot.status = "cancelled"
    if body.get("flagged") is True:
        slot.flagged = True
    _log_action(db, teacher_id, "override", assignment_id=slot.assignment_id, payload=body)
    db.commit()
    return {"id": slot.id, "duration_minutes": slot.duration_minutes, "cancelled": slot.cancelled, "flagged": slot.flagged}


@router.post("/mocks/assignment-students/{slot_id}/actions")
async def slot_action(
    slot_id: str,
    body: dict,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    slot = db.query(MockAssignmentStudent).filter_by(id=slot_id).first()
    if not slot:
        raise HTTPException(404, "Student assignment not found.")
    assignment = db.query(MockAssignment).filter_by(id=slot.assignment_id).first()
    if assignment and not _owned(assignment, teacher_id):
        raise HTTPException(404, "Student assignment not found.")
    action = (body.get("action") or "").strip()
    attempt = (
        db.query(MockAttempt)
        .filter_by(assignment_student_id=slot.id)
        .order_by(MockAttempt.started_at.desc())
        .first()
    )
    if action == "reopen":
        if attempt:
            attempt.status = "in_progress"
            attempt.published = False
            attempt.submitted_at = None
            slot.status = "assigned"
    elif action == "reset":
        if attempt:
            db.query(MockAnswer).filter_by(attempt_id=attempt.id).delete()
            db.delete(attempt)
        slot.status = "assigned"
        slot.flagged = False
    elif action == "cancel":
        slot.cancelled = True
        slot.status = "cancelled"
    elif action == "flag":
        slot.flagged = True
        if attempt:
            attempt.warning_count = (attempt.warning_count or 0) + 1
    elif action == "force_submit":
        if not attempt:
            raise HTTPException(400, "No attempt to submit.")
        attempt.status = "submitted"
        attempt.submitted_at = datetime.utcnow()
        slot.status = "submitted"
    elif action == "pause":
        if attempt and assignment:
            now = datetime.utcnow()
            attempt.remaining_seconds = _attempt_remaining(attempt, slot, assignment, now)
            attempt.paused = True
    elif action == "resume":
        if attempt and assignment:
            duration = int((slot.duration_minutes or assignment.duration_minutes or 60) * 60)
            frozen = max(0, int(attempt.remaining_seconds or 0))
            attempt.started_at = datetime.utcnow() - timedelta(seconds=max(0, duration - frozen))
            attempt.paused = False
    elif action == "message":
        _notify(db, slot.student_id, "Message from your teacher", body.get("message") or "", f"/student/mocks/{slot.assignment_id}")
    else:
        raise HTTPException(400, "Unknown action.")
    _log_action(db, teacher_id, action, assignment_id=slot.assignment_id, attempt_id=attempt.id if attempt else None, payload=body)
    db.commit()
    return {"ok": True, "action": action}


@router.get("/mocks/student/inbox")
async def student_inbox(db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    slots = db.query(MockAssignmentStudent).filter(MockAssignmentStudent.student_id.in_(keys)).all()
    now = datetime.utcnow()
    items = []
    for slot in slots:
        row = db.query(MockAssignment).filter_by(id=slot.assignment_id).first()
        if not row:
            continue
        attempt = (
            db.query(MockAttempt)
            .filter_by(assignment_student_id=slot.id)
            .order_by(MockAttempt.started_at.desc())
            .first()
        )
        status = _inbox_status(now, row, slot, attempt)
        items.append(
            {
                **_assignment_public(row),
                "slot_id": slot.id,
                "inbox_status": status,
                "student_id": slot.student_id,
                "duration_minutes": slot.duration_minutes or row.duration_minutes,
                "available_at": _iso(slot.available_at or row.available_at),
                "deadline_at": _iso(slot.deadline_at or row.deadline_at),
                "attempt_id": attempt.id if attempt else None,
                "published": bool(attempt.published) if attempt else False,
                "listening_band": attempt.listening_band if attempt and attempt.published else None,
                "reading_band": attempt.reading_band if attempt and attempt.published else None,
                "writing_band": attempt.writing_band if attempt and attempt.published else None,
                "speaking_band": attempt.speaking_band if attempt and attempt.published else None,
                "overall_band": attempt.overall_band if attempt and attempt.published else None,
                "writing_feedback": attempt.writing_feedback if attempt and attempt.published else None,
            }
        )
    return {"items": items}


@router.get("/mocks/student/{assignment_id}")
async def student_detail(assignment_id: str, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    row = db.query(MockAssignment).filter_by(id=assignment_id).first()
    slot = _find_slot(db, assignment_id, keys)
    if not row or not slot or slot.cancelled:
        raise HTTPException(404, "Mock not found.")
    attempt = (
        db.query(MockAttempt)
        .filter_by(assignment_student_id=slot.id)
        .order_by(MockAttempt.started_at.desc())
        .first()
    )
    now = datetime.utcnow()
    published = bool(attempt.published) if attempt else False
    return {
        **_assignment_public(row),
        "slot_id": slot.id,
        "inbox_status": _inbox_status(now, row, slot, attempt),
        "duration_minutes": slot.duration_minutes or row.duration_minutes,
        "available_at": _iso(slot.available_at or row.available_at),
        "deadline_at": _iso(slot.deadline_at or row.deadline_at),
        "attempt_id": attempt.id if attempt else None,
        "question_count": 40 if row.mock_type in ("full", "reading", "listening") else 2,
        "privacy_notice": "This supervised mock requires screen sharing. Your screen will be visible to your teacher while the mock is active."
        if row.screen_monitoring
        else None,
        "published": published,
        "listening_band": attempt.listening_band if attempt and published else None,
        "reading_band": attempt.reading_band if attempt and published else None,
        "writing_band": attempt.writing_band if attempt and published else None,
        "speaking_band": attempt.speaking_band if attempt and published else None,
        "overall_band": attempt.overall_band if attempt and published else None,
        "writing_feedback": attempt.writing_feedback if attempt and published else None,
    }


@router.post("/mocks/attempts/start")
async def start_attempt(body: dict, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    assignment_id = body.get("assignment_id")
    row = db.query(MockAssignment).filter_by(id=assignment_id).first()
    slot = _find_slot(db, assignment_id, keys) if assignment_id else None
    if not row or not slot or slot.cancelled:
        raise HTTPException(404, "Mock not found.")
    now = datetime.utcnow()
    available = slot.available_at or row.available_at
    deadline = slot.deadline_at or row.deadline_at
    if available and now < available:
        raise HTTPException(400, "This mock is not available yet.")
    if deadline and now > deadline and not row.allow_late_start:
        raise HTTPException(400, "The start window has closed.")
    existing = db.query(MockAttempt).filter_by(assignment_student_id=slot.id).count()
    latest = (
        db.query(MockAttempt)
        .filter_by(assignment_student_id=slot.id)
        .order_by(MockAttempt.started_at.desc())
        .first()
    )
    if latest and latest.status == "in_progress":
        latest.remaining_seconds = _attempt_remaining(latest, slot, row, now)
        db.commit()
        return _start_payload(latest, row)
    if existing >= (row.attempts_allowed or 1) and not (latest and latest.status == "in_progress"):
        raise HTTPException(400, "No attempts remaining.")
    duration = slot.duration_minutes or row.duration_minutes
    module = _module_for(row.mock_type)
    payload = dict(row.paper_refs or {})
    payload["test_type"] = row.ielts_type
    paper_source = (getattr(row, "paper_source", None) or "bank").strip().lower()
    piece = bool(payload.get("passage_id") or payload.get("part_id") or payload.get("question_id"))
    scope = "piece" if piece or module == "speaking" else ("full_mock" if row.mock_type in ("full", "reading", "listening", "writing") else "piece")
    if paper_source == "manual":
        # Manual writing/speaking are single-prompt pieces; reading/listening use snapshots.
        if module in ("writing", "speaking") and (payload.get("prompt") or payload.get("question_id")):
            scope = "piece"
        if module == "writing" and not payload.get("prompt") and not payload.get("question_id") and not payload.get("task1_id"):
            raise HTTPException(400, "This manual writing mock has no prompt.")
        if module == "reading" and not (
            payload.get("passage")
            or payload.get("paragraphs")
            or payload.get("passages")
            or payload.get("snapshot")
            or payload.get("test_id")
            or payload.get("reading_test_id")
        ):
            raise HTTPException(400, "This manual reading mock has no passage.")
        if module == "listening" and not payload.get("questions") and not payload.get("snapshot") and not payload.get("test_id") and not payload.get("listening_test_id"):
            raise HTTPException(400, "This manual listening mock has no questions.")
        if module == "speaking" and not payload.get("prompt") and not payload.get("speaking_test") and not payload.get("test_id"):
            raise HTTPException(400, "This manual speaking mock has no prompt.")
    else:
        if module == "reading":
            payload["test_id"] = payload.get("reading_test_id") or payload.get("test_id")
            if not payload.get("test_id"):
                raise HTTPException(400, "No reading paper is linked to this mock yet.")
        if module == "listening":
            payload["test_id"] = payload.get("listening_test_id") or payload.get("test_id")
            if not payload.get("test_id"):
                raise HTTPException(400, "No listening paper is linked to this mock yet.")
        if module == "writing":
            if not payload.get("task1_id") and not payload.get("task2_id") and not payload.get("question_id"):
                raise HTTPException(400, "No writing paper is linked to this mock yet.")
        if module == "speaking":
            payload["test_id"] = payload.get("speaking_test_id") or payload.get("test_id")
            if not payload.get("test_id"):
                raise HTTPException(400, "No speaking paper is linked to this mock yet.")
    homework_row = SimpleNamespace(
        id=row.id,
        payload=payload,
        module=module,
        scope=scope,
        task_label=payload.get("section_label") or ("Full Mock" if scope == "full_mock" else module),
        source=paper_source if paper_source in {"bank", "manual"} else "bank",
        timed="1",
        title=row.title,
    )
    try:
        session = await _open_skill(db, homework_row, slot.student_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not open mock paper")
        raise HTTPException(400, f"Could not open the paper for this mock: {exc}") from exc
    attempt = MockAttempt(
        assignment_student_id=slot.id,
        assignment_id=row.id,
        student_id=slot.student_id,
        status="in_progress",
        current_section=module,
        current_question=1,
        question_total=40 if module in ("reading", "listening") else 2,
        remaining_seconds=duration * 60,
        started_at=now,
        last_seen_at=now,
    )
    attempt.skill_ref = session
    db.add(attempt)
    db.flush()
    db.add(
        MockIntegrityEvent(
            attempt_id=attempt.id,
            student_id=slot.student_id,
            event_type="TEST_STARTED",
            metadata_json=json.dumps({"consent": bool(body.get("consent"))}),
        )
    )
    slot.status = "in_progress"
    db.commit()
    db.refresh(attempt)
    return _start_payload(attempt, row)


@router.post("/mocks/attempts/{attempt_id}/answers")
async def save_answers(attempt_id: str, body: dict, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    attempt = db.query(MockAttempt).filter_by(id=attempt_id).first()
    if not attempt or attempt.student_id not in keys:
        raise HTTPException(404, "Attempt not found.")
    answers = body.get("answers") or [{"question_key": body.get("question_key"), "value": body.get("value")}]
    seq = body.get("client_seq")
    for item in answers:
        key = str((item or {}).get("question_key") or "")
        if not key:
            continue
        db.add(
            MockAnswer(
                attempt_id=attempt.id,
                section=body.get("section") or attempt.current_section,
                question_key=key,
                value_json=json.dumps((item or {}).get("value")),
                client_seq=seq,
            )
        )
    attempt.last_seen_at = datetime.utcnow()
    if body.get("current_question") is not None:
        attempt.current_question = int(body["current_question"])
    if body.get("current_section"):
        attempt.current_section = body["current_section"]
    row = db.query(MockAssignment).filter_by(id=attempt.assignment_id).first()
    slot = db.query(MockAssignmentStudent).filter_by(id=attempt.assignment_student_id).first()
    remaining = attempt.remaining_seconds
    if row and slot:
        remaining = _attempt_remaining(attempt, slot, row)
        attempt.remaining_seconds = remaining
    db.commit()
    return {"ok": True, "remaining_seconds": remaining}


@router.post("/mocks/attempts/{attempt_id}/heartbeat")
async def heartbeat(attempt_id: str, body: dict, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    attempt = db.query(MockAttempt).filter_by(id=attempt_id).first()
    if not attempt or attempt.student_id not in keys:
        raise HTTPException(404, "Attempt not found.")
    now = datetime.utcnow()
    row = db.query(MockAssignment).filter_by(id=attempt.assignment_id).first()
    slot = db.query(MockAssignmentStudent).filter_by(id=attempt.assignment_student_id).first()
    if row and slot:
        attempt.remaining_seconds = _attempt_remaining(attempt, slot, row, now)
    attempt.last_seen_at = now
    if body.get("current_section"):
        attempt.current_section = body["current_section"]
    if body.get("current_question") is not None:
        attempt.current_question = int(body["current_question"])
    event_type = body.get("event_type")
    if event_type and event_type not in ("ANSWER_SAVED", "HEARTBEAT"):
        db.add(
            MockIntegrityEvent(
                attempt_id=attempt.id,
                student_id=attempt.student_id,
                event_type=str(event_type),
                metadata_json=json.dumps(body.get("metadata") or {}),
            )
        )
        if event_type == "SCREEN_SHARE_STARTED":
            attempt.screen_share_active = True
            attempt.last_warning = None
        if event_type == "SCREEN_SHARE_STOPPED":
            attempt.screen_share_active = False
        if event_type in ("FULLSCREEN_EXIT", "SCREEN_SHARE_STOPPED", "WINDOW_BLUR", "TAB_HIDDEN", "DISCONNECTED"):
            attempt.warning_count = (attempt.warning_count or 0) + 1
            attempt.last_warning = str(event_type)
            if attempt.warning_count >= 3 and slot:
                slot.flagged = True
        if event_type in ("FULLSCREEN_RESTORED", "WINDOW_FOCUS", "RECONNECTED"):
            attempt.last_warning = None
        if event_type == "DISCONNECTED":
            attempt.connection_status = "disconnected"
        else:
            attempt.connection_status = "stable"
    elif attempt.status == "in_progress":
        attempt.connection_status = "stable"
    if row and row.auto_submit and (attempt.remaining_seconds or 0) <= 0 and attempt.status == "in_progress":
        attempt.status = "submitted"
        attempt.submitted_at = now
        if slot:
            slot.status = "submitted"
        db.add(MockIntegrityEvent(attempt_id=attempt.id, student_id=attempt.student_id, event_type="TEST_SUBMITTED"))
    db.commit()
    if row and slot:
        try:
            from app.mocks.realtime import emit_assignment_state

            await emit_assignment_state(
                row.id,
                {
                    "assignmentId": row.id,
                    "eventType": event_type or "HEARTBEAT",
                    "timestamp": now.isoformat() + "Z",
                    **_student_payload(now, row, slot, attempt),
                },
            )
        except Exception:
            logger.warning("Could not broadcast mock heartbeat", exc_info=False)
    return {
        "ok": True,
        "warning_count": attempt.warning_count,
        "remaining_seconds": attempt.remaining_seconds,
        "status": attempt.status,
        "paused": bool(attempt.paused),
    }


@router.post("/mocks/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, body: dict, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    _enabled()
    attempt = db.query(MockAttempt).filter_by(id=attempt_id).first()
    if not attempt or attempt.student_id not in keys:
        raise HTTPException(404, "Attempt not found.")
    attempt.status = "submitted"
    attempt.submitted_at = datetime.utcnow()
    attempt.last_seen_at = attempt.submitted_at
    slot = db.query(MockAssignmentStudent).filter_by(id=attempt.assignment_student_id).first()
    if slot:
        slot.status = "submitted"
    assignment = db.query(MockAssignment).filter_by(id=attempt.assignment_id).first()
    skill = attempt.skill_ref
    if skill.get("kind") == "reading" and skill.get("attemptId"):
        from app.reading.models import ReadingAttempt

        reading = db.query(ReadingAttempt).filter_by(id=skill["attemptId"]).first()
        if reading and reading.estimated_band is not None:
            attempt.reading_band = reading.estimated_band
    if skill.get("kind") == "listening" and skill.get("attemptId"):
        from app.listening.models import ListeningAttempt

        listening = db.query(ListeningAttempt).filter_by(id=skill["attemptId"]).first()
        if listening and listening.estimated_band is not None:
            attempt.listening_band = listening.estimated_band
    if skill.get("kind") in ("writing-question", "writing-mock"):
        from app.writing.models import WritingAttempt, WritingMockSession

        if skill.get("kind") == "writing-question" and skill.get("ref"):
            writing = db.query(WritingAttempt).filter_by(id=skill["ref"]).first()
            if writing and writing.estimated_band is not None:
                attempt.writing_band = writing.estimated_band
                grading = writing.grading if isinstance(writing.grading, dict) else None
                if grading and grading.get("estimated_band_explanation"):
                    attempt.writing_feedback = grading.get("estimated_band_explanation")
        if skill.get("kind") == "writing-mock" and skill.get("mockId"):
            mock = db.query(WritingMockSession).filter_by(id=skill["mockId"]).first()
            if mock and getattr(mock, "overall_band", None) is not None:
                attempt.writing_band = mock.overall_band
    db.add(MockIntegrityEvent(attempt_id=attempt.id, student_id=attempt.student_id, event_type="TEST_SUBMITTED"))
    result_mode = (getattr(assignment, "result_mode", None) or "teacher") if assignment else "teacher"
    if result_mode == "ai":
        bands = [b for b in (attempt.listening_band, attempt.reading_band, attempt.writing_band, attempt.speaking_band) if b is not None]
        if bands:
            attempt.overall_band = round((sum(bands) / len(bands)) * 2) / 2
        if not attempt.writing_feedback and skill.get("kind", "").startswith("writing"):
            attempt.writing_feedback = "AI estimated band published automatically. Your teacher can still override it later."
        attempt.published = True
        attempt.status = "reviewed"
        if slot:
            slot.status = "reviewed"
        _notify(
            db,
            attempt.student_id,
            "Mock result ready",
            "AI checked your mock. Open Mock Tests → Results to see your estimated band.",
            f"/student/mocks/{attempt.assignment_id}",
        )
    db.commit()
    return {
        "id": attempt.id,
        "status": attempt.status,
        "published": bool(attempt.published),
        "overall_band": attempt.overall_band,
        "result_mode": result_mode,
    }


@router.get("/mocks/assignments/{assignment_id}/monitor")
async def monitor(
    assignment_id: str,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    from app.mocks.livekit_tokens import livekit_configured

    data = await assignment_students(assignment_id, db=db, teacher_id=teacher_id, _="teacher")
    students = data["students"]
    configured = livekit_configured()
    return {
        **data,
        "totals": {
            "total": len(students),
            "active": len([s for s in students if s["status"] == "in_progress"]),
            "not_started": len([s for s in students if s["status"] in ("available", "upcoming")]),
            "disconnected": len([s for s in students if s["status"] == "disconnected"]),
            "submitted": len([s for s in students if s["status"] in ("completed", "results")]),
            "warnings": sum(s.get("warning_count") or 0 for s in students),
        },
        "screen_note": None if configured else "LiveKit is not configured yet. Student status still updates. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to enable live screens.",
        "livekit": {"configured": configured},
    }


@router.post("/mocks/attempts/{attempt_id}/review")
async def review_attempt(
    attempt_id: str,
    body: dict,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    _: str = Depends(require_teacher),
):
    _enabled()
    attempt = db.query(MockAttempt).filter_by(id=attempt_id).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found.")
    assignment = db.query(MockAssignment).filter_by(id=attempt.assignment_id).first()
    if assignment and not _owned(assignment, teacher_id):
        raise HTTPException(404, "Attempt not found.")
    for field in ("listening_band", "reading_band", "writing_band", "speaking_band"):
        if field in body and body[field] is not None:
            setattr(attempt, field, float(body[field]))
    if "writing_feedback" in body or any(k in body for k in ("task_achievement", "coherence", "lexical", "grammar")):
        parts = []
        if body.get("task_achievement") is not None:
            parts.append(f"Task Achievement / Task Response: {body.get('task_achievement')}")
        if body.get("coherence") is not None:
            parts.append(f"Coherence & Cohesion: {body.get('coherence')}")
        if body.get("lexical") is not None:
            parts.append(f"Lexical Resource: {body.get('lexical')}")
        if body.get("grammar") is not None:
            parts.append(f"Grammatical Range & Accuracy: {body.get('grammar')}")
        if body.get("writing_feedback"):
            parts.append(str(body.get("writing_feedback")))
        attempt.writing_feedback = "\n".join(parts) if parts else body.get("writing_feedback")
    bands = [b for b in (attempt.listening_band, attempt.reading_band, attempt.writing_band, attempt.speaking_band) if b is not None]
    if bands:
        raw = sum(bands) / len(bands)
        attempt.overall_band = round(raw * 2) / 2
    if body.get("publish"):
        attempt.published = True
        attempt.status = "reviewed"
        _notify(db, attempt.student_id, "Mock result published", "Your teacher published a mock result.", f"/student/mocks/{attempt.assignment_id}")
    _log_action(db, teacher_id, "review", assignment_id=attempt.assignment_id, attempt_id=attempt.id, payload=body)
    db.commit()
    return {
        "id": attempt.id,
        "published": attempt.published,
        "overall_band": attempt.overall_band,
        "writing_band": attempt.writing_band,
    }


@router.get("/mocks/attempts/{attempt_id}/events")
async def attempt_events(attempt_id: str, db: Session = Depends(get_db), _: str = Depends(require_teacher)):
    _enabled()
    rows = (
        db.query(MockIntegrityEvent)
        .filter_by(attempt_id=attempt_id)
        .order_by(MockIntegrityEvent.created_at.asc())
        .all()
    )
    return {
        "events": [
            {"id": r.id, "event_type": r.event_type, "timestamp": _iso(r.created_at), "metadata": r.metadata_json}
            for r in rows
        ]
    }


@router.get("/notifications")
async def list_notifications(db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    rows = (
        db.query(LmsNotification)
        .filter(LmsNotification.user_id.in_(keys))
        .order_by(LmsNotification.created_at.desc())
        .limit(40)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "title": r.title,
                "body": r.body,
                "href": r.href,
                "read": bool(r.read_at),
                "created_at": _iso(r.created_at),
            }
            for r in rows
        ]
    }


@router.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: str, db: Session = Depends(get_db), keys: list[str] = Depends(get_student_keys)):
    row = db.query(LmsNotification).filter_by(id=notification_id).first()
    if not row or row.user_id not in keys:
        raise HTTPException(404, "Notification not found.")
    row.read_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/mocks/livekit/token")
async def livekit_token(
    body: dict,
    db: Session = Depends(get_db),
    teacher_id: str = Depends(get_teacher_id),
    keys: list[str] = Depends(get_student_keys),
):
    _enabled()
    from app.mocks.livekit_tokens import (
        create_token,
        livekit_configured,
        room_name,
        student_identity,
        teacher_identity,
    )

    if not livekit_configured():
        return {"enabled": False, "url": "", "token": "", "room": "", "identity": ""}
    assignment_id = body.get("assignment_id")
    role = (body.get("role") or "").strip()
    row = db.query(MockAssignment).filter_by(id=assignment_id).first()
    if not row:
        raise HTTPException(404, "Assignment not found.")
    room = room_name(row.id)
    try:
        if role == "teacher":
            if not _owned(row, teacher_id):
                raise HTTPException(404, "Assignment not found.")
            identity = teacher_identity(teacher_id)
            token = create_token(
                identity=identity,
                name=teacher_id,
                room=room,
                can_publish=True,
                can_subscribe=True,
            )
            return {"enabled": True, "url": settings.LIVEKIT_URL, "token": token, "room": room, "identity": identity}
        slot = _find_slot(db, row.id, keys)
        if not slot or slot.cancelled:
            raise HTTPException(404, "Mock not found.")
        identity = student_identity(slot.student_id)
        token = create_token(
            identity=identity,
            name=slot.student_name or slot.student_id,
            room=room,
            can_publish=True,
            can_subscribe=True,
        )
        return {"enabled": True, "url": settings.LIVEKIT_URL, "token": token, "room": room, "identity": identity}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("LiveKit token failed: %s", exc)
        return {"enabled": False, "url": "", "token": "", "room": "", "identity": ""}
