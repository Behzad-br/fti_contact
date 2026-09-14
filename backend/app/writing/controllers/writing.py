"""Student-facing IELTS Writing API."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.deps import resolve_student_id as get_student_id
from app.config import settings
from app.database import get_db
from app.writing.models import (
    WritingAssignment,
    WritingAttempt,
    WritingBookmark,
    WritingGeneration,
    WritingMockSession,
    WritingModelAnswer,
    WritingQuestion,
)
from app.writing.services import writing_ai, writing_progress, writing_service
from app.llm.client import MinimaxError
from app.writing.services.writing_core import public_question_dict, resolve_writing_file

logger = logging.getLogger(__name__)
router = APIRouter()


def _question_or_404(db: Session, question_id: str) -> WritingQuestion:
    q = (
        db.query(WritingQuestion)
        .filter((WritingQuestion.id == question_id) | (WritingQuestion.public_id == question_id))
        .first()
    )
    if not q:
        raise HTTPException(404, "Question not found.")
    return q


def _student_question(db: Session, question_id: str) -> WritingQuestion:
    q = _question_or_404(db, question_id)
    if q.status == "archived":
        raise HTTPException(410, "This question has been archived.")
    if q.status != "published":
        raise HTTPException(404, "Question not found.")
    return q


def _attempt_or_404(db: Session, attempt_id: str, student_id: str) -> WritingAttempt:
    a = db.query(WritingAttempt).filter_by(id=attempt_id).first()
    if not a:
        raise HTTPException(404, "Attempt not found.")
    if a.student_id != student_id:
        raise HTTPException(403, "You cannot access another student's attempt.")
    return a


def _serialize_question(q: WritingQuestion, db: Session, student_id: str) -> dict:
    state = writing_service.attempt_state_for_question(db, student_id, q.id)
    bm = (
        db.query(WritingBookmark)
        .filter_by(student_id=student_id, question_id=q.id)
        .first()
        is not None
    )
    return public_question_dict(
        q,
        extra={"attempt_state": state, "bookmarked": bm},
        include_teacher=False,
    )


def _serialize_attempt(a: WritingAttempt, include_feedback: bool = True) -> dict:
    band, source = writing_service.display_band(a)
    text = a.answer_text or ""
    if a.status != "in_progress":
        text = writing_service.freeze_submitted_text(a)
    payload = {
        "id": a.id,
        "question_id": a.question_id,
        "mock_session_id": a.mock_session_id,
        "answer_text": text,
        "word_count": a.word_count,
        "minimum_words": a.question.minimum_words if a.question else None,
        "started_at": a.started_at.isoformat() if a.started_at else None,
        "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        "time_spent_seconds": a.time_spent_seconds,
        "status": a.status,
        "attempt_number": a.attempt_number,
        "estimated_band": a.estimated_band,
        "teacher_band": a.teacher_band,
        "final_band": band,
        "band_source": source,
        "grading_error": a.grading_error,
        "timer_mode": a.timer_mode,
        "below_minimum": bool(
            a.question and (a.word_count or 0) < (a.question.minimum_words or 0)
        ),
    }
    if include_feedback and a.status in ("graded", "published", "teacher_review"):
        payload["grading"] = a.grading
        payload["teacher_comments"] = a.teacher_comments
        payload["teacher_feedback"] = a.teacher_feedback
        payload["model_answers"] = [
            {"id": m.id, "band_style": m.band_style, "text": m.text, "label": "AI-generated practice model response"}
            for m in (a.model_answers or [])
        ]
    else:
        payload["grading"] = None
    if a.question:
        payload["question"] = public_question_dict(a.question)
    return payload


@router.get("/writing/questions")
async def list_questions(
    test_type: Optional[str] = None,
    task_number: Optional[int] = None,
    question_type: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    attempted: Optional[str] = None,
    bookmarked: Optional[bool] = None,
    sort: str = "newest",
    search: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    data = writing_service.list_questions(
        db,
        student_id,
        test_type=test_type,
        task_number=task_number,
        question_type=question_type,
        topic=topic,
        difficulty=difficulty,
        attempted=attempted,
        bookmarked=bookmarked,
        sort=sort,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {
        "total": data["total"],
        "questions": [
            public_question_dict(
                item["question"],
                extra={
                    "attempt_state": item["attempt_state"],
                    "bookmarked": item["bookmarked"],
                },
            )
            for item in data["questions"]
        ],
    }


@router.get("/writing/catalog")
async def writing_catalog(
    test_type: str = Query("academic"),
    db: Session = Depends(get_db),
):
    if test_type not in ("academic", "general_training"):
        raise HTTPException(400, "test_type must be academic or general_training.")
    return writing_service.build_catalog(db, test_type)


@router.get("/writing/questions/random")
async def random_question(
    test_type: str,
    task_number: int,
    question_type: Optional[str] = None,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = writing_service.pick_random_question(db, student_id, test_type, task_number, question_type)
    if not q:
        raise HTTPException(404, "No published questions match those filters.")
    return _serialize_question(q, db, student_id)


@router.get("/writing/questions/{question_id}")
async def get_question(
    question_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = _student_question(db, question_id)
    return _serialize_question(q, db, student_id)


@router.get("/writing/images/{question_id}")
async def writing_image(question_id: str, n: int = 0, db: Session = Depends(get_db)):
    q = _question_or_404(db, question_id)
    paths = []
    if q.image_path:
        paths.append(q.image_path)
    visual = q.visual_data if isinstance(q.visual_data, dict) else {}
    paths.extend(visual.get("extra_images") or [])
    if n < 0 or n >= len(paths):
        raise HTTPException(404, "No image for this question.")
    resolved = resolve_writing_file(paths[n])
    if not resolved:
        raise HTTPException(404, "No image for this question.")
    return FileResponse(resolved)


@router.post("/writing/questions/{question_id}/start")
async def start_question(
    question_id: str,
    timer_mode: str = "countup",
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = _student_question(db, question_id)
    attempt = writing_service.start_attempt(db, student_id, q, timer_mode=timer_mode)
    return _serialize_attempt(attempt, include_feedback=False)


@router.get("/writing/drafts")
async def continue_drafts(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(WritingAttempt)
        .filter_by(student_id=student_id, status="in_progress")
        .order_by(WritingAttempt.updated_at.desc())
        .all()
    )
    return {"attempts": [_serialize_attempt(a, include_feedback=False) for a in rows]}


@router.get("/writing/attempts")
async def list_attempts(
    test_type: Optional[str] = None,
    task_number: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = db.query(WritingAttempt).filter_by(student_id=student_id)
    if status:
        q = q.filter(WritingAttempt.status == status)
    rows = q.order_by(WritingAttempt.created_at.desc()).all()
    items = []
    for a in rows:
        if test_type and a.question and a.question.test_type != test_type:
            continue
        if task_number and a.question and a.question.task_number != task_number:
            continue
        items.append(_serialize_attempt(a))
    return {"attempts": items, "total": len(items)}


@router.get("/writing/attempts/{attempt_id}")
async def get_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    return _serialize_attempt(_attempt_or_404(db, attempt_id, student_id))


@router.patch("/writing/attempts/{attempt_id}")
async def autosave_attempt(
    attempt_id: str,
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    attempt = _attempt_or_404(db, attempt_id, student_id)
    try:
        writing_service.save_draft(
            db,
            attempt,
            str(body.get("answer_text") or ""),
            body.get("time_spent_seconds"),
        )
    except PermissionError as exc:
        raise HTTPException(409, str(exc))
    return {
        "id": attempt.id,
        "status": "saved",
        "word_count": attempt.word_count,
        "updated_at": attempt.updated_at.isoformat() if attempt.updated_at else None,
    }


@router.post("/writing/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: str,
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    attempt = _attempt_or_404(db, attempt_id, student_id)
    assignment = None
    if attempt.assignment_id:
        assignment = db.query(WritingAssignment).filter_by(id=attempt.assignment_id).first()
        if assignment and assignment.deadline and datetime.utcnow() > assignment.deadline:
            if assignment.lock_after_deadline and not assignment.allow_late:
                raise HTTPException(403, "The deadline has passed.")

    try:
        writing_service.submit_attempt(
            db,
            attempt,
            body.get("answer_text"),
            body.get("time_spent_seconds"),
        )
    except PermissionError as exc:
        raise HTTPException(409, str(exc))

    enabled = writing_service.ai_grading_enabled(db, assignment)
    if not enabled:
        attempt.status = "teacher_review"
        db.commit()
        return _serialize_attempt(attempt)

    attempt.status = "grading"
    db.commit()
    try:
        await writing_ai.grade_attempt(db, attempt)
    except Exception as exc:
        logger.warning("Grading failed for %s: %s", attempt.id, exc)
        attempt.status = "grading"
        attempt.grading_error = str(exc)
        db.commit()
    if attempt.mock_session_id:
        mock = db.query(WritingMockSession).filter_by(id=attempt.mock_session_id).first()
        if mock:
            writing_service.apply_mock_bands(db, mock)
    return _serialize_attempt(attempt)


@router.post("/writing/attempts/{attempt_id}/grade")
async def retry_grade(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    attempt = _attempt_or_404(db, attempt_id, student_id)
    if attempt.status == "in_progress":
        raise HTTPException(400, "Submit the attempt before grading.")
    try:
        await writing_ai.grade_attempt(db, attempt)
    except Exception as exc:
        raise HTTPException(503, f"Grading failed: {exc}")
    return _serialize_attempt(attempt)


@router.post("/writing/attempts/{attempt_id}/model-answer")
async def model_answer(
    attempt_id: str,
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    attempt = _attempt_or_404(db, attempt_id, student_id)
    if attempt.status == "in_progress":
        raise HTTPException(400, "Submit first. Model answers are hidden before submission.")
    band_style = int(body.get("band_style") or 7)
    if band_style not in (7, 8, 9):
        raise HTTPException(400, "band_style must be 7, 8, or 9.")
    try:
        text = await writing_ai.generate_model_answer(attempt, band_style, db)
    except (MinimaxError, ValueError) as exc:
        raise HTTPException(503, str(exc))
    row = WritingModelAnswer(
        attempt_id=attempt.id,
        question_id=attempt.question_id,
        band_style=band_style,
        text=text,
        ai_model=settings.OPENAI_WRITING_GENERATION_MODEL or settings.LLM_MODEL,
    )
    db.add(row)
    db.commit()
    return {
        "id": row.id,
        "band_style": band_style,
        "text": text,
        "label": "AI-generated practice model response",
    }


@router.post("/writing/questions/generate")
async def generate_question(
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    raise HTTPException(400, "AI generate is only available for Speaking.")
    surprise = bool(body.get("surprise"))
    test_type = body.get("test_type") or ("academic" if not surprise else "academic")
    task_number = int(body.get("task_number") or (2 if surprise else 1))
    if surprise:
        import random

        test_type = random.choice(["academic", "general_training"])
        task_number = random.choice([1, 2])
    try:
        payload = await writing_ai.generate_question_payload(
            db,
            test_type=test_type,
            task_number=task_number,
            question_type=None if surprise else body.get("question_type"),
            topic=None if surprise else body.get("topic"),
            difficulty=None if surprise else body.get("difficulty"),
            student_id=student_id,
        )
    except Exception as exc:
        raise HTTPException(503, f"AI generation failed: {exc}")
    q, gen = writing_service.persist_generation(
        db,
        student_id,
        payload,
        parameters=body,
        permanent_draft=False,
    )
    attempt = writing_service.start_attempt(db, student_id, q)
    return {
        "generation_id": gen.id,
        "question": public_question_dict(q),
        "attempt": _serialize_attempt(attempt, include_feedback=False),
        "duplicate_flag": q.duplicate_flag,
    }


@router.post("/writing/mock-tests")
async def start_mock(
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    test_type = body.get("test_type") or "academic"
    if test_type not in ("academic", "general_training"):
        raise HTTPException(400, "test_type must be academic or general_training.")
    try:
        mock = writing_service.create_mock(
            db,
            student_id,
            test_type,
            assignment_id=body.get("assignment_id"),
            task1_id=body.get("task1_id"),
            task2_id=body.get("task2_id"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return _serialize_mock(db, mock, student_id)


def _serialize_mock(db: Session, mock: WritingMockSession, student_id: str) -> dict:
    a1 = db.query(WritingAttempt).filter_by(id=mock.task1_attempt_id).first()
    a2 = db.query(WritingAttempt).filter_by(id=mock.task2_attempt_id).first()
    return {
        "id": mock.id,
        "test_type": mock.test_type,
        "status": mock.status,
        "duration_seconds": mock.duration_seconds,
        "started_at": mock.started_at.isoformat() if mock.started_at else None,
        "submitted_at": mock.submitted_at.isoformat() if mock.submitted_at else None,
        "locked": mock.locked,
        "task1_band": mock.task1_band,
        "task2_band": mock.task2_band,
        "overall_estimated_band": mock.overall_band,
        "weighting": "Task 2 counts twice Task 1: (T1 + 2*T2) / 3",
        "task1": _serialize_attempt(a1, include_feedback=mock.status != "in_progress") if a1 else None,
        "task2": _serialize_attempt(a2, include_feedback=mock.status != "in_progress") if a2 else None,
    }


@router.get("/writing/mock-tests/{mock_id}")
async def get_mock(
    mock_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    mock = db.query(WritingMockSession).filter_by(id=mock_id).first()
    if not mock or mock.student_id != student_id:
        raise HTTPException(404, "Mock test not found.")
    return _serialize_mock(db, mock, student_id)


@router.patch("/writing/mock-tests/{mock_id}")
async def save_mock(
    mock_id: str,
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    mock = db.query(WritingMockSession).filter_by(id=mock_id).first()
    if not mock or mock.student_id != student_id:
        raise HTTPException(404, "Mock test not found.")
    if mock.locked:
        raise HTTPException(409, "This mock test is locked.")
    for key, attempt_id in (("task1", mock.task1_attempt_id), ("task2", mock.task2_attempt_id)):
        part = body.get(key) or {}
        if "answer_text" in part:
            attempt = db.query(WritingAttempt).filter_by(id=attempt_id).first()
            if attempt:
                writing_service.save_draft(
                    db, attempt, part.get("answer_text") or "", part.get("time_spent_seconds")
                )
    return _serialize_mock(db, mock, student_id)


@router.post("/writing/mock-tests/{mock_id}/submit")
async def submit_mock(
    mock_id: str,
    body: dict,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    mock = db.query(WritingMockSession).filter_by(id=mock_id).first()
    if not mock or mock.student_id != student_id:
        raise HTTPException(404, "Mock test not found.")
    if mock.locked and mock.status != "in_progress":
        return _serialize_mock(db, mock, student_id)

    for key, attempt_id in (("task1", mock.task1_attempt_id), ("task2", mock.task2_attempt_id)):
        part = (body.get(key) or {})
        attempt = db.query(WritingAttempt).filter_by(id=attempt_id).first()
        if not attempt:
            continue
        if attempt.status == "in_progress":
            writing_service.submit_attempt(
                db, attempt, part.get("answer_text"), part.get("time_spent_seconds")
            )
        if writing_service.ai_grading_enabled(db) and attempt.status in ("submitted", "grading"):
            try:
                await writing_ai.grade_attempt(db, attempt)
            except Exception as exc:
                attempt.grading_error = str(exc)
                attempt.status = "grading"
                db.commit()
        elif attempt.status == "submitted":
            attempt.status = "teacher_review"
            db.commit()

    mock.status = "submitted"
    mock.locked = True
    mock.submitted_at = datetime.utcnow()
    writing_service.apply_mock_bands(db, mock)
    return _serialize_mock(db, mock, student_id)


@router.get("/writing/history")
async def writing_history(
    test_type: Optional[str] = None,
    task_number: Optional[int] = None,
    min_band: Optional[float] = None,
    max_band: Optional[float] = None,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(WritingAttempt)
        .filter(WritingAttempt.student_id == student_id)
        .filter(WritingAttempt.status != "in_progress")
        .order_by(WritingAttempt.submitted_at.desc().nullslast())
        .all()
    )
    items = []
    for a in rows:
        q = a.question
        band, source = writing_service.display_band(a)
        if test_type and q and q.test_type != test_type:
            continue
        if task_number and q and q.task_number != task_number:
            continue
        if min_band is not None and (band is None or band < min_band):
            continue
        if max_band is not None and (band is None or band > max_band):
            continue
        items.append(
            {
                "id": a.id,
                "date": (a.submitted_at or a.started_at).isoformat() if (a.submitted_at or a.started_at) else None,
                "test_type": q.test_type if q else None,
                "task_number": q.task_number if q else None,
                "question_type": q.question_type if q else None,
                "topic": q.topic if q else None,
                "word_count": a.word_count,
                "estimated_band": a.estimated_band,
                "teacher_band": a.teacher_band,
                "final_band": band,
                "band_source": source,
                "status": a.status,
                "mock_session_id": a.mock_session_id,
            }
        )
    return {"items": items, "total": len(items)}


@router.get("/writing/progress")
async def progress(
    days: Optional[int] = None,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    data = writing_progress.collect_progress(db, student_id, days=days)
    data["recommended_filters"] = writing_progress.recommended_filters(data)
    return data


@router.get("/writing/bookmarks")
async def list_bookmarks(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = db.query(WritingBookmark).filter_by(student_id=student_id).all()
    questions = []
    for b in rows:
        if b.question and b.question.status == "published":
            questions.append(_serialize_question(b.question, db, student_id))
    return {"questions": questions}


@router.post("/writing/bookmarks/{question_id}")
async def add_bookmark(
    question_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = _student_question(db, question_id)
    existing = db.query(WritingBookmark).filter_by(student_id=student_id, question_id=q.id).first()
    if not existing:
        db.add(WritingBookmark(student_id=student_id, question_id=q.id))
        db.commit()
    return {"bookmarked": True}


@router.delete("/writing/bookmarks/{question_id}")
async def remove_bookmark(
    question_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    q = _question_or_404(db, question_id)
    db.query(WritingBookmark).filter_by(student_id=student_id, question_id=q.id).delete()
    db.commit()
    return {"bookmarked": False}


@router.get("/writing/assignments")
async def my_assignments(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(WritingAssignment)
        .filter(
            (WritingAssignment.student_id == student_id)
            | (WritingAssignment.student_id.is_(None))
        )
        .order_by(WritingAssignment.created_at.desc())
        .all()
    )
    return {
        "assignments": [
            {
                "id": a.id,
                "title": a.title,
                "deadline": a.deadline.isoformat() if a.deadline else None,
                "timed": a.timed,
                "question_id": a.question_id,
                "mock_test_type": a.mock_test_type,
                "lock_after_deadline": a.lock_after_deadline,
                "allow_late": a.allow_late,
            }
            for a in rows
            if a.student_id in (None, student_id)
            or (a.batch_label and a.student_id is None)
        ]
    }
