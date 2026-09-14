"""Teacher/admin IELTS Writing API. Protected by WRITING_ADMIN_TOKEN."""
from __future__ import annotations

import csv
import io
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.writing.models import (
    WritingAppSetting,
    WritingAssignment,
    WritingAttempt,
    WritingGeneration,
    WritingQuestion,
)
from app.writing.services import writing_ai, writing_service
from app.writing.services.writing_core import (
    is_duplicate_prompt,
    public_question_dict,
    validate_visual_data,
)
from app.writing.services.writing_import import import_file, import_records, load_records, record_from_bank_item

router = APIRouter()


def require_admin(x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")) -> str:
    expected = (settings.WRITING_ADMIN_TOKEN or "").strip()
    provided = (x_admin_token or "").strip()
    if expected:
        if provided != expected:
            raise HTTPException(403, "Admin token required.")
        return "admin"
    # Local personal app: empty token allows admin tools.
    return "admin"


def _q(db: Session, question_id: str) -> WritingQuestion:
    row = (
        db.query(WritingQuestion)
        .filter((WritingQuestion.id == question_id) | (WritingQuestion.public_id == question_id))
        .first()
    )
    if not row:
        raise HTTPException(404, "Question not found.")
    return row


@router.get("/writing/admin/questions")
async def admin_list(
    test_type: Optional[str] = None,
    task: Optional[int] = None,
    question_type: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    q = db.query(WritingQuestion)
    if test_type:
        q = q.filter(WritingQuestion.test_type == test_type)
    if task:
        q = q.filter(WritingQuestion.task_number == task)
    if question_type:
        q = q.filter(WritingQuestion.question_type == question_type)
    if topic:
        q = q.filter(WritingQuestion.topic.ilike(f"%{topic}%"))
    if difficulty:
        q = q.filter(WritingQuestion.difficulty == difficulty)
    if source:
        q = q.filter(WritingQuestion.source_type == source)
    if status:
        q = q.filter(WritingQuestion.status == status)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (WritingQuestion.prompt.ilike(like)) | (WritingQuestion.public_id.ilike(like))
        )
    rows = q.order_by(WritingQuestion.created_at.desc()).all()
    return {"total": len(rows), "questions": [public_question_dict(r, include_teacher=True) for r in rows]}


@router.post("/writing/admin/questions")
async def admin_create(body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    public_id = body.get("public_id") or f"TCH-{uuid.uuid4().hex[:8].upper()}"
    if db.query(WritingQuestion).filter_by(public_id=public_id).first():
        raise HTTPException(409, "public_id already exists.")
    q_type = body.get("question_type")
    ok, err, visual = validate_visual_data(q_type, body.get("visual_data"))
    if not ok:
        raise HTTPException(400, err)
    dup = False
    for other in db.query(WritingQuestion.prompt).all():
        if is_duplicate_prompt(body.get("prompt") or "", other[0] or ""):
            dup = True
            break
    q = WritingQuestion(
        public_id=public_id,
        test_type=body.get("test_type"),
        task_number=int(body.get("task_number") or 1),
        question_type=q_type,
        topic=body.get("topic"),
        difficulty=body.get("difficulty"),
        title=body.get("title"),
        prompt=body.get("prompt") or "",
        instructions=body.get("instructions"),
        minimum_words=int(body.get("minimum_words") or 150),
        recommended_minutes=int(body.get("recommended_minutes") or 20),
        letter_tone=body.get("letter_tone"),
        recipient=body.get("recipient"),
        source_type=body.get("source_type") or "teacher_created",
        source_reference=body.get("source_reference"),
        generated_by_ai=False,
        status=body.get("status") or "draft",
        is_permanent_bank=True,
        duplicate_flag=dup,
        teacher_notes=body.get("teacher_notes"),
    )
    q.visual_data = visual
    q.bullet_points = body.get("bullet_points") or []
    q.planning_tags = body.get("planning_tags") or []
    db.add(q)
    db.commit()
    db.refresh(q)
    return public_question_dict(q, include_teacher=True)


@router.get("/writing/admin/questions/{question_id}")
async def admin_get(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return public_question_dict(_q(db, question_id), include_teacher=True)


@router.patch("/writing/admin/questions/{question_id}")
async def admin_update(
    question_id: str, body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)
):
    q = _q(db, question_id)
    for field in (
        "test_type",
        "question_type",
        "topic",
        "difficulty",
        "title",
        "prompt",
        "instructions",
        "letter_tone",
        "recipient",
        "source_type",
        "source_reference",
        "status",
        "teacher_notes",
        "reviewed_by",
    ):
        if field in body:
            setattr(q, field, body[field])
    if "task_number" in body:
        q.task_number = int(body["task_number"])
    if "minimum_words" in body:
        q.minimum_words = int(body["minimum_words"])
    if "recommended_minutes" in body:
        q.recommended_minutes = int(body["recommended_minutes"])
    if "visual_data" in body:
        ok, err, visual = validate_visual_data(q.question_type, body["visual_data"])
        if not ok:
            raise HTTPException(400, err)
        q.visual_data = visual
    if "bullet_points" in body:
        q.bullet_points = body["bullet_points"]
    if "is_permanent_bank" in body:
        q.is_permanent_bank = bool(body["is_permanent_bank"])
    q.updated_at = datetime.utcnow()
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.post("/writing/admin/questions/{question_id}/publish")
async def publish(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    q = _q(db, question_id)
    q.status = "published"
    q.reviewed_by = "admin"
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.post("/writing/admin/questions/{question_id}/unpublish")
async def unpublish(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    q = _q(db, question_id)
    q.status = "draft"
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.post("/writing/admin/questions/{question_id}/archive")
async def archive(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    q = _q(db, question_id)
    q.status = "archived"
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.post("/writing/admin/questions/{question_id}/duplicate")
async def duplicate(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    src = _q(db, question_id)
    q = WritingQuestion(
        public_id=f"{src.public_id}-COPY-{uuid.uuid4().hex[:4].upper()}",
        test_type=src.test_type,
        task_number=src.task_number,
        question_type=src.question_type,
        topic=src.topic,
        difficulty=src.difficulty,
        title=src.title,
        prompt=src.prompt,
        instructions=src.instructions,
        minimum_words=src.minimum_words,
        recommended_minutes=src.recommended_minutes,
        visual_data_json=src.visual_data_json,
        letter_tone=src.letter_tone,
        recipient=src.recipient,
        bullet_points_json=src.bullet_points_json,
        planning_tags_json=src.planning_tags_json,
        source_type="teacher_created",
        status="draft",
        is_permanent_bank=True,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return public_question_dict(q, include_teacher=True)


@router.delete("/writing/admin/questions/{question_id}")
async def delete_question(question_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    q = _q(db, question_id)
    used = db.query(WritingAttempt).filter_by(question_id=q.id).count()
    if used:
        raise HTTPException(409, "Cannot delete a question that already has attempts. Archive it instead.")
    db.delete(q)
    db.commit()
    return {"deleted": True}


@router.post("/writing/admin/questions/bulk-publish")
async def bulk_publish(body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    ids = body.get("ids") or []
    if not ids:
        return {"published": 0}
    rows = (
        db.query(WritingQuestion)
        .filter(or_(WritingQuestion.id.in_(ids), WritingQuestion.public_id.in_(ids)))
        .all()
    )
    for q in rows:
        q.status = "published"
        q.reviewed_by = "admin"
    db.commit()
    return {"published": len(rows)}


@router.post("/writing/admin/questions/{question_id}/image")
async def upload_image(
    question_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    q = _q(db, question_id)
    dest_dir = Path(settings.WRITING_IMAGE_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "image.png").suffix or ".png"
    dest = dest_dir / f"{q.id}{suffix}"
    with dest.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)
    q.image_path = str(dest)
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.post("/writing/admin/import")
async def admin_import(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    suffix = Path(file.filename or "bank.json").suffix.lower()
    raw = await file.read()
    tmp = Path(settings.TEMP_DIR) / f"import-{uuid.uuid4().hex}{suffix}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(raw)
    try:
        records = load_records(tmp)
        preview = []
        invalid = []
        for item in records[:40]:
            try:
                preview.append(record_from_bank_item(item))
            except Exception as exc:
                invalid.append({"id": item.get("id"), "error": str(exc)})
        result = import_file(db, tmp, dry_run=dry_run, force_status="review")
        result["preview"] = preview
        result["preview_invalid"] = invalid
        return result
    finally:
        tmp.unlink(missing_ok=True)


@router.post("/writing/admin/generate-batch")
async def generate_batch(
    body: dict,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    count = int(body.get("count") or 1)
    count = max(1, min(count, 50))
    created = []
    errors = []
    for _ in range(count):
        try:
            payload = await writing_ai.generate_question_payload(
                db,
                test_type=body.get("test_type") or "academic",
                task_number=int(body.get("task_number") or 1),
                question_type=body.get("question_type"),
                topic=body.get("topic"),
                difficulty=body.get("difficulty"),
                student_id="admin",
            )
            q, _gen = writing_service.persist_generation(
                db,
                "admin",
                payload,
                parameters=body,
                permanent_draft=True,
            )
            created.append(public_question_dict(q, include_teacher=True))
        except Exception as exc:
            errors.append(str(exc))
    return {"created": created, "errors": errors, "count": len(created)}


@router.post("/writing/admin/generations/{generation_id}/save-to-bank")
async def save_generation(
    generation_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)
):
    gen = db.query(WritingGeneration).filter_by(id=generation_id).first()
    if not gen or not gen.question:
        raise HTTPException(404, "Generation not found.")
    q = gen.question
    q.is_permanent_bank = True
    q.status = "draft"
    gen.saved_to_bank = True
    db.commit()
    return public_question_dict(q, include_teacher=True)


@router.get("/writing/admin/submissions")
async def submissions(
    status: Optional[str] = None,
    student_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    q = db.query(WritingAttempt).filter(WritingAttempt.status != "in_progress")
    if status:
        q = q.filter(WritingAttempt.status == status)
    if student_id:
        q = q.filter(WritingAttempt.student_id == student_id)
    rows = q.order_by(WritingAttempt.submitted_at.desc().nullslast()).all()
    return {
        "submissions": [
            {
                "id": a.id,
                "student_id": a.student_id,
                "status": a.status,
                "word_count": a.word_count,
                "time_spent_seconds": a.time_spent_seconds,
                "estimated_band": a.estimated_band,
                "teacher_band": a.teacher_band,
                "question": public_question_dict(a.question) if a.question else None,
                "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
            }
            for a in rows
        ]
    }


@router.get("/writing/admin/submissions/{attempt_id}")
async def submission_detail(
    attempt_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)
):
    a = db.query(WritingAttempt).filter_by(id=attempt_id).first()
    if not a:
        raise HTTPException(404, "Submission not found.")
    return {
        "id": a.id,
        "student_id": a.student_id,
        "status": a.status,
        "answer_text": a.submitted_text if a.submitted_text is not None else a.answer_text,
        "word_count": a.word_count,
        "time_spent_seconds": a.time_spent_seconds,
        "estimated_band": a.estimated_band,
        "teacher_band": a.teacher_band,
        "final_band": a.teacher_band if a.teacher_band is not None else a.estimated_band,
        "grading": a.grading,
        "teacher_feedback": a.teacher_feedback,
        "teacher_comments": a.teacher_comments,
        "question": public_question_dict(a.question, include_teacher=True) if a.question else None,
        "grading_error": a.grading_error,
    }


@router.post("/writing/admin/submissions/{attempt_id}/review")
async def teacher_review(
    attempt_id: str, body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)
):
    a = db.query(WritingAttempt).filter_by(id=attempt_id).first()
    if not a:
        raise HTTPException(404, "Submission not found.")
    if "teacher_band" in body:
        a.teacher_band = float(body["teacher_band"]) if body["teacher_band"] is not None else None
    if "teacher_comments" in body:
        a.teacher_comments = body["teacher_comments"]
    if "teacher_feedback" in body:
        a.teacher_feedback = body["teacher_feedback"]
    if a.teacher_band is not None:
        a.final_band = a.teacher_band
    if body.get("publish"):
        a.status = "published"
    elif body.get("request_resubmission"):
        writing_service.add_revision(db, a, "reopen_for_resubmission", "teacher", body)
        a.status = "in_progress"
        a.submitted_text = a.submitted_text  # keep original snapshot via revision
    else:
        a.status = "teacher_review"
    db.commit()
    return {"id": a.id, "status": a.status, "teacher_band": a.teacher_band, "final_band": a.final_band}


@router.post("/writing/admin/submissions/{attempt_id}/regrade")
async def regrade(attempt_id: str, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    a = db.query(WritingAttempt).filter_by(id=attempt_id).first()
    if not a:
        raise HTTPException(404, "Submission not found.")
    try:
        await writing_ai.grade_attempt(db, a)
    except Exception as exc:
        raise HTTPException(503, str(exc))
    return {"id": a.id, "status": a.status, "estimated_band": a.estimated_band, "grading": a.grading}


@router.post("/writing/admin/assignments")
async def create_assignment(body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    deadline = body.get("deadline")
    parsed = datetime.fromisoformat(deadline.replace("Z", "+00:00")) if deadline else None
    row = WritingAssignment(
        title=body.get("title") or "Writing assignment",
        student_id=body.get("student_id"),
        batch_label=body.get("batch_label"),
        question_id=body.get("question_id"),
        mock_test_type=body.get("mock_test_type"),
        deadline=parsed,
        timed=bool(body.get("timed", True)),
        ai_grading_enabled=bool(body.get("ai_grading_enabled", True)),
        lock_after_deadline=bool(body.get("lock_after_deadline", True)),
        allow_late=bool(body.get("allow_late", False)),
        created_by="admin",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "title": row.title, "student_id": row.student_id, "deadline": deadline}


@router.get("/writing/admin/assignments")
async def list_assignments(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    rows = db.query(WritingAssignment).order_by(WritingAssignment.created_at.desc()).all()
    return {
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "student_id": a.student_id,
                "batch_label": a.batch_label,
                "question_id": a.question_id,
                "mock_test_type": a.mock_test_type,
                "deadline": a.deadline.isoformat() if a.deadline else None,
                "timed": a.timed,
                "ai_grading_enabled": a.ai_grading_enabled,
            }
            for a in rows
        ]
    }


@router.post("/writing/admin/settings")
async def save_settings(body: dict, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    if "ai_grading_enabled" in body:
        row = db.query(WritingAppSetting).filter_by(key="ai_grading_enabled").first()
        value = "true" if body["ai_grading_enabled"] else "false"
        if row:
            row.value = value
        else:
            db.add(WritingAppSetting(key="ai_grading_enabled", value=value))
        db.commit()
    row = db.query(WritingAppSetting).filter_by(key="ai_grading_enabled").first()
    return {
        "ai_grading_enabled": writing_service.ai_grading_enabled(db),
        "stored": row.value if row else None,
    }
