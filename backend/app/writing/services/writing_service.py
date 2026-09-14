"""Attempt, mock, and library business logic."""
from __future__ import annotations

import random
import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.writing.models import (
    WritingAppSetting,
    WritingAssignment,
    WritingAttempt,
    WritingAttemptRevision,
    WritingBookmark,
    WritingGeneration,
    WritingMockSession,
    WritingQuestion,
)
from app.writing.services.writing_core import count_words, is_duplicate_prompt, overall_writing_band


def student_visible_questions(db: Session):
    return db.query(WritingQuestion).filter(
        WritingQuestion.status == "published",
        WritingQuestion.is_permanent_bank.is_(True),
    )


def _catalog_part(q: WritingQuestion) -> dict:
    return {
        "id": q.id,
        "public_id": q.public_id,
        "part_number": q.task_number,
        "title": f"Task {q.task_number}",
        "question_type": q.question_type,
        "prompt_preview": (q.prompt or "")[:180],
    }


def _fti_suffix(public_id: str) -> str:
    match = re.search(r"(\d+)$", public_id or "")
    return match.group(1) if match else public_id or ""


def build_catalog(db: Session, test_type: str) -> dict:
    rows = student_visible_questions(db).filter(WritingQuestion.test_type == test_type).all()
    packs: dict[str, dict] = {}
    fti_t1: list[WritingQuestion] = []
    fti_t2: list[WritingQuestion] = []
    for q in rows:
        if q.pack_test_id:
            bucket = packs.setdefault(
                q.pack_test_id,
                {
                    "id": q.pack_test_id,
                    "title": q.pack_test_id,
                    "book_id": q.book_id,
                    "book_title": q.book_title or "Writing pack",
                    "test_number": q.test_number or 0,
                    "test_type": q.test_type,
                    "duration_minutes": 60,
                    "parts": [],
                },
            )
            if q.book_id:
                bucket["book_id"] = q.book_id
            if q.book_title:
                bucket["book_title"] = q.book_title
            if q.test_number:
                bucket["test_number"] = q.test_number
                bucket["title"] = (
                    f"{q.book_title} Test {int(q.test_number):02d}" if q.book_title else bucket["title"]
                )
            bucket["parts"].append(_catalog_part(q))
        elif q.task_number == 1:
            fti_t1.append(q)
        else:
            fti_t2.append(q)

    for bucket in packs.values():
        bucket["parts"].sort(key=lambda part: part["part_number"])

    t2_map = {_fti_suffix(q.public_id): q for q in fti_t2}
    used: set[str] = set()
    fti_tests = []
    for q1 in sorted(fti_t1, key=lambda q: _fti_suffix(q.public_id)):
        suffix = _fti_suffix(q1.public_id)
        q2 = t2_map.get(suffix)
        try:
            number = int(suffix)
        except (TypeError, ValueError):
            number = len(fti_tests) + 1
        parts = [_catalog_part(q1)]
        if q2:
            parts.append(_catalog_part(q2))
            used.add(suffix)
        fti_tests.append(
            {
                "id": f"fti-{test_type}-{suffix}",
                "title": f"FTI Writing Test {number:02d}",
                "book_id": f"fti-writing-{test_type}",
                "book_title": "FTI Writing",
                "test_number": number,
                "test_type": test_type,
                "duration_minutes": 60,
                "parts": parts,
            }
        )
    for q2 in fti_t2:
        suffix = _fti_suffix(q2.public_id)
        if suffix in used:
            continue
        try:
            number = int(suffix)
        except (TypeError, ValueError):
            number = len(fti_tests) + 1
        fti_tests.append(
            {
                "id": f"fti-{test_type}-t2-{suffix}",
                "title": f"FTI Writing Test {number:02d}",
                "book_id": f"fti-writing-{test_type}",
                "book_title": "FTI Writing",
                "test_number": number,
                "test_type": test_type,
                "duration_minutes": 60,
                "parts": [_catalog_part(q2)],
            }
        )

    tests = list(packs.values()) + fti_tests
    tests.sort(key=lambda item: (item.get("book_title") or "", item.get("test_number") or 0, item.get("id") or ""))
    return {"test_type": test_type, "total": len(tests), "tests": tests}


def attempt_state_for_question(db: Session, student_id: str, question_id: str) -> str:
    rows = (
        db.query(WritingAttempt.status)
        .filter(
            WritingAttempt.student_id == student_id,
            WritingAttempt.question_id == question_id,
        )
        .all()
    )
    statuses = [r[0] for r in rows]
    completed = [s for s in statuses if s in ("submitted", "grading", "graded", "teacher_review", "published")]
    drafts = [s for s in statuses if s == "in_progress"]
    if len(completed) > 1:
        return "attempted_multiple"
    if completed and drafts:
        return "attempted_multiple"
    if completed:
        return "completed"
    if drafts:
        return "in_progress"
    return "new"


def list_questions(
    db: Session,
    student_id: str,
    *,
    test_type: Optional[str] = None,
    task_number: Optional[int] = None,
    question_type: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    attempted: Optional[str] = None,
    bookmarked: Optional[bool] = None,
    sort: str = "newest",
    search: Optional[str] = None,
    include_generated: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    q = student_visible_questions(db)
    if include_generated:
        q = db.query(WritingQuestion).filter(WritingQuestion.status == "published")
    if test_type:
        q = q.filter(WritingQuestion.test_type == test_type)
    if task_number:
        q = q.filter(WritingQuestion.task_number == task_number)
    if question_type:
        q = q.filter(WritingQuestion.question_type == question_type)
    if topic:
        q = q.filter(WritingQuestion.topic.ilike(f"%{topic}%"))
    if difficulty:
        q = q.filter(WritingQuestion.difficulty == difficulty)
    if search:
        like = f"%{search}%"
        q = q.filter(
            or_(
                WritingQuestion.prompt.ilike(like),
                WritingQuestion.topic.ilike(like),
                WritingQuestion.public_id.ilike(like),
            )
        )
    if bookmarked:
        q = q.join(WritingBookmark, WritingBookmark.question_id == WritingQuestion.id).filter(
            WritingBookmark.student_id == student_id
        )

    rows = q.order_by(WritingQuestion.created_at.desc()).all()
    items = []
    bookmark_ids = {
        b.question_id
        for b in db.query(WritingBookmark).filter_by(student_id=student_id).all()
    }
    for row in rows:
        state = attempt_state_for_question(db, student_id, row.id)
        if attempted == "not_attempted" and state != "new":
            continue
        if attempted == "attempted" and state == "new":
            continue
        items.append((row, state, row.id in bookmark_ids))

    if sort == "random":
        random.shuffle(items)
    elif sort == "newest":
        items.sort(key=lambda x: x[0].created_at or datetime.utcnow(), reverse=True)

    total = len(items)
    sliced = items[offset : offset + limit]
    return {
        "total": total,
        "questions": [
            {"question": row, "attempt_state": state, "bookmarked": bm} for row, state, bm in sliced
        ],
    }


def next_attempt_number(db: Session, student_id: str, question_id: str) -> int:
    current = (
        db.query(func.max(WritingAttempt.attempt_number))
        .filter(
            WritingAttempt.student_id == student_id,
            WritingAttempt.question_id == question_id,
        )
        .scalar()
    )
    return int(current or 0) + 1


def start_attempt(
    db: Session,
    student_id: str,
    question: WritingQuestion,
    *,
    mock_session_id: Optional[str] = None,
    assignment_id: Optional[str] = None,
    timer_mode: str = "countup",
) -> WritingAttempt:
    existing = (
        db.query(WritingAttempt)
        .filter_by(
            student_id=student_id,
            question_id=question.id,
            status="in_progress",
            mock_session_id=mock_session_id,
        )
        .first()
    )
    if existing:
        return existing

    attempt = WritingAttempt(
        student_id=student_id,
        question_id=question.id,
        mock_session_id=mock_session_id,
        assignment_id=assignment_id,
        answer_text="",
        word_count=0,
        status="in_progress",
        is_ai_generated_question=bool(question.generated_by_ai and not question.is_permanent_bank),
        attempt_number=next_attempt_number(db, student_id, question.id),
        timer_mode=timer_mode,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def save_draft(db: Session, attempt: WritingAttempt, text: str, time_spent_seconds: Optional[int] = None) -> WritingAttempt:
    if attempt.status != "in_progress":
        raise PermissionError("This attempt can no longer be edited.")
    attempt.answer_text = text
    attempt.word_count = count_words(text)
    if time_spent_seconds is not None:
        attempt.time_spent_seconds = time_spent_seconds
    attempt.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(attempt)
    return attempt


def submit_attempt(db: Session, attempt: WritingAttempt, text: Optional[str], time_spent_seconds: Optional[int]) -> WritingAttempt:
    if attempt.status not in ("in_progress", "grading"):
        raise PermissionError("Attempt already submitted.")
    body = text if text is not None else (attempt.answer_text or "")
    attempt.answer_text = body
    attempt.submitted_text = body
    attempt.word_count = count_words(body)
    attempt.submitted_at = datetime.utcnow()
    if time_spent_seconds is not None:
        attempt.time_spent_seconds = time_spent_seconds
    attempt.status = "submitted"
    db.commit()
    db.refresh(attempt)
    return attempt


def freeze_submitted_text(attempt: WritingAttempt) -> str:
    return attempt.submitted_text if attempt.submitted_text is not None else (attempt.answer_text or "")


def ai_grading_enabled(db: Session, assignment: Optional[WritingAssignment] = None) -> bool:
    if assignment is not None and assignment.ai_grading_enabled is not None:
        return bool(assignment.ai_grading_enabled)
    row = db.query(WritingAppSetting).filter_by(key="ai_grading_enabled").first()
    if row is not None:
        return str(row.value).lower() in ("1", "true", "yes", "on")
    return bool(settings.WRITING_AI_GRADING_ENABLED)


def pick_random_question(
    db: Session,
    student_id: str,
    test_type: str,
    task_number: int,
    question_type: Optional[str] = None,
) -> Optional[WritingQuestion]:
    recent_ids = [
        r[0]
        for r in db.query(WritingAttempt.question_id)
        .filter(WritingAttempt.student_id == student_id)
        .order_by(WritingAttempt.started_at.desc())
        .limit(20)
        .all()
    ]
    q = student_visible_questions(db).filter(
        WritingQuestion.test_type == test_type,
        WritingQuestion.task_number == task_number,
    )
    if question_type:
        q = q.filter(WritingQuestion.question_type == question_type)
    candidates = q.all()
    if not candidates:
        return None
    unused = [c for c in candidates if c.id not in recent_ids]
    pool = unused or candidates
    return random.choice(pool)


def _question_by_any_id(db: Session, ident: Optional[str]) -> Optional[WritingQuestion]:
    if not ident:
        return None
    return (
        db.query(WritingQuestion)
        .filter((WritingQuestion.id == ident) | (WritingQuestion.public_id == ident))
        .first()
    )


def create_mock(
    db: Session,
    student_id: str,
    test_type: str,
    *,
    assignment_id: Optional[str] = None,
    task1_id: Optional[str] = None,
    task2_id: Optional[str] = None,
) -> WritingMockSession:
    q1 = _question_by_any_id(db, task1_id)
    q2 = _question_by_any_id(db, task2_id)
    if not q1:
        q1 = pick_random_question(db, student_id, test_type, 1)
    if not q2:
        q2 = pick_random_question(db, student_id, test_type, 2)
    if not q1 or not q2:
        raise ValueError("Not enough published questions for a full mock test.")

    mock = WritingMockSession(
        student_id=student_id,
        test_type=test_type,
        assignment_id=assignment_id,
        status="in_progress",
        duration_seconds=3600,
    )
    db.add(mock)
    db.flush()
    a1 = start_attempt(db, student_id, q1, mock_session_id=mock.id, timer_mode="countdown")
    a2 = start_attempt(db, student_id, q2, mock_session_id=mock.id, timer_mode="countdown")
    mock.task1_attempt_id = a1.id
    mock.task2_attempt_id = a2.id
    db.commit()
    db.refresh(mock)
    return mock


def persist_generation(
    db: Session,
    student_id: str,
    payload: dict,
    *,
    parameters: Optional[dict] = None,
    permanent_draft: bool = False,
    existing_prompts: Optional[list[str]] = None,
) -> tuple[WritingQuestion, WritingGeneration]:
    public_id = f"AI-{uuid.uuid4().hex[:10].upper()}"
    dup = False
    prompts = existing_prompts or [
        p[0] for p in db.query(WritingQuestion.prompt).filter(WritingQuestion.is_permanent_bank.is_(True)).all()
    ]
    for other in prompts:
        if is_duplicate_prompt(payload["prompt"], other):
            dup = True
            break

    q = WritingQuestion(
        public_id=public_id,
        test_type=payload["test_type"],
        task_number=payload["task_number"],
        question_type=payload["question_type"],
        topic=payload.get("topic"),
        difficulty=payload.get("difficulty"),
        title=payload.get("title"),
        prompt=payload["prompt"],
        minimum_words=payload.get("minimum_words") or 150,
        recommended_minutes=payload.get("recommended_minutes") or 20,
        letter_tone=payload.get("letter_tone"),
        recipient=payload.get("recipient"),
        source_type="ai_generated",
        generated_by_ai=True,
        generated_by=student_id,
        status="draft" if permanent_draft else "published",
        is_permanent_bank=permanent_draft,
        duplicate_flag=dup,
    )
    q.visual_data = payload.get("visual_data")
    q.bullet_points = payload.get("bullet_points") or []
    db.add(q)
    db.flush()
    gen = WritingGeneration(
        student_id=student_id,
        question_id=q.id,
        test_type=q.test_type,
        task_number=q.task_number,
        question_type=q.question_type,
        topic=q.topic,
        difficulty=q.difficulty,
        prompt=q.prompt,
        ai_model=payload.get("ai_model"),
        saved_to_bank=permanent_draft,
    )
    gen.parameters_json = None
    gen.structured_data_json = None
    if parameters:
        import json

        gen.parameters_json = json.dumps(parameters)
    if payload.get("visual_data"):
        import json

        gen.structured_data_json = json.dumps(payload["visual_data"])
    db.add(gen)
    db.commit()
    db.refresh(q)
    db.refresh(gen)
    return q, gen


def add_revision(db: Session, attempt: WritingAttempt, action: str, actor: str, meta=None):
    import json

    db.add(
        WritingAttemptRevision(
            attempt_id=attempt.id,
            actor=actor,
            action=action,
            snapshot_text=attempt.submitted_text,
            meta_json=json.dumps(meta) if meta else None,
        )
    )


def display_band(attempt: WritingAttempt) -> tuple[Optional[float], str]:
    if attempt.teacher_band is not None:
        return attempt.teacher_band, "teacher"
    if attempt.estimated_band is not None:
        return attempt.estimated_band, "ai_estimated"
    return None, "none"


def apply_mock_bands(db: Session, mock: WritingMockSession) -> WritingMockSession:
    a1 = db.query(WritingAttempt).filter_by(id=mock.task1_attempt_id).first()
    a2 = db.query(WritingAttempt).filter_by(id=mock.task2_attempt_id).first()
    b1 = display_band(a1)[0] if a1 else None
    b2 = display_band(a2)[0] if a2 else None
    mock.task1_band = b1
    mock.task2_band = b2
    if b1 is not None and b2 is not None:
        mock.overall_band = overall_writing_band(b1, b2)
    db.commit()
    db.refresh(mock)
    return mock
