"""Writing grading, generation, and model-answer services."""
from __future__ import annotations

import json
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.writing.models import WritingAttempt, WritingQuestion
from app.llm.client import MinimaxError
from app.writing.services.writing_core import (
    attach_practice_feedback,
    count_words,
    non_attempt_grading,
    script_attempt_kind,
    validate_grading_payload,
    validate_visual_data,
)
from app.writing.services.writing_llm import generation_model, grading_model, writing_chat_json
from app.writing.services.writing_prompts import (
    GENERATION_SYSTEM,
    GRADING_SYSTEM,
    MODEL_ANSWER_SYSTEM,
)


def _question_context(question: WritingQuestion) -> str:
    payload = {
        "test_type": question.test_type,
        "task_number": question.task_number,
        "question_type": question.question_type,
        "topic": question.topic,
        "prompt": question.prompt,
        "visual_data": question.visual_data,
        "letter_tone": question.letter_tone,
        "recipient": question.recipient,
        "bullet_points": question.bullet_points,
        "minimum_words": question.minimum_words,
    }
    return json.dumps(payload, ensure_ascii=False)


async def grade_attempt(db: Session, attempt: WritingAttempt) -> WritingAttempt:
    question = attempt.question or db.query(WritingQuestion).filter_by(id=attempt.question_id).first()
    if not question:
        raise ValueError("Question missing for attempt.")

    text = attempt.submitted_text if attempt.submitted_text is not None else attempt.answer_text or ""
    words = count_words(text)
    min_words = int(question.minimum_words or (150 if question.task_number == 1 else 250))
    kind = script_attempt_kind(text)
    if kind in {"empty", "non_attempt"}:
        parsed = non_attempt_grading(
            task_number=question.task_number,
            test_type=question.test_type,
            minimum_words=min_words,
            word_count=words,
            kind=kind,
        )
        attempt.grading = parsed
        attempt.estimated_band = 0.0
        if attempt.teacher_band is None:
            attempt.final_band = 0.0
        attempt.ai_model_used = "rule-non-attempt"
        attempt.grading_version = "writing-v2-non-attempt"
        attempt.grading_error = None
        attempt.status = "graded"
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        return attempt

    length_note = (
        f"BELOW MINIMUM ({words}/{min_words}). Penalise Task Achievement/Response and make length the first why_this_band item."
        if words < min_words
        else f"Word count meets the {min_words}-word minimum."
    )
    user = (
        f"Grade this IELTS Writing response for practice feedback.\n"
        f"Word count: {words}. Minimum required: {min_words}. {length_note}\n"
        f"Explain why this estimated band was given, using evidence from THIS script, then give next-attempt suggestions.\n"
        f"Question:\n{_question_context(question)}\n\n"
        f"Student response:\n{text or '[empty]'}"
    )
    try:
        raw = await writing_chat_json(
            GRADING_SYSTEM,
            user,
            model=grading_model(),
            db=db,
            request_type="grade",
            student_id=attempt.student_id,
        )
        parsed = attach_practice_feedback(
            validate_grading_payload(raw, question.task_number),
            task_number=question.task_number,
            test_type=question.test_type,
            minimum_words=min_words,
            word_count=words,
        )
        attempt.grading = parsed
        attempt.estimated_band = parsed["estimated_overall_band"]
        if attempt.teacher_band is None:
            attempt.final_band = attempt.estimated_band
        attempt.ai_model_used = grading_model()
        attempt.grading_version = "writing-v1"
        attempt.grading_error = None
        attempt.status = "graded"
    except (MinimaxError, ValueError) as exc:
        attempt.grading_error = str(exc)
        attempt.status = "grading"
        raise
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


async def generate_question_payload(
    db: Session,
    *,
    test_type: str,
    task_number: int,
    question_type: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[str] = None,
    student_id: Optional[str] = None,
) -> dict:
    user = json.dumps(
        {
            "test_type": test_type,
            "task_number": task_number,
            "question_type": question_type,
            "topic": topic,
            "difficulty": difficulty,
            "surprise": not any([question_type, topic, difficulty]),
        }
    )
    raw = await writing_chat_json(
        GENERATION_SYSTEM,
        user,
        model=generation_model(),
        db=db,
        request_type="generate_question",
        student_id=student_id,
    )
    q_type = raw.get("question_type") or question_type
    if not q_type:
        raise ValueError("Generator did not return question_type.")
    prompt = (raw.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Generator did not return a prompt.")

    visual = raw.get("visual_data") or {
        k: raw[k]
        for k in (
            "title",
            "unit",
            "years",
            "categories",
            "series",
            "charts",
            "bar_chart",
            "line_graph",
            "stages",
            "changes",
            "before_year",
            "after_year",
            "landmarks",
            "added",
            "removed",
            "relocated",
            "before",
            "after",
        )
        if k in raw
    }
    ok, err, visual_norm = validate_visual_data(q_type, visual if visual else None)
    if not ok:
        raise ValueError(f"Generated visual_data failed validation: {err}")

    return {
        "test_type": test_type,
        "task_number": task_number,
        "question_type": q_type,
        "topic": raw.get("topic") or topic,
        "difficulty": raw.get("difficulty") or difficulty or "medium",
        "title": raw.get("title") or (visual_norm or {}).get("title"),
        "prompt": prompt,
        "minimum_words": 150 if task_number == 1 else 250,
        "recommended_minutes": 20 if task_number == 1 else 40,
        "visual_data": visual_norm,
        "letter_tone": raw.get("letter_tone"),
        "recipient": raw.get("recipient"),
        "bullet_points": raw.get("bullet_points") or [],
        "source_type": "ai_generated",
        "generated_by_ai": True,
    }


async def generate_model_answer(attempt: WritingAttempt, band_style: int, db: Session) -> str:
    question = attempt.question
    user = json.dumps(
        {
            "band_style": band_style,
            "question": _question_context(question) if question else {},
            "note": "Write a complete response meeting the word minimum.",
        }
    )
    raw = await writing_chat_json(
        MODEL_ANSWER_SYSTEM,
        user,
        model=generation_model(),
        db=db,
        request_type="model_answer",
        student_id=attempt.student_id,
    )
    text = raw.get("text") if isinstance(raw, dict) else None
    if not text:
        raise ValueError("Model answer was empty.")
    return text
