"""
services/speaking_session.py — IELTS Speaking Session Engine.

Migrated and adapted from:
  - scripts/answer_flow.py  (Stage enum, SessionState, AnswerFlow)
  - scripts/ielts_flow.py   (calculate_band, advance_state logic)

Changes from original:
  - Removed all Telegram/Notion/OpenClaw dependencies
  - State is persisted to SQLite (via SQLAlchemy) instead of flat JSON file
  - Works with plain dicts + DB models, not chat message dispatch
  - Supports both "stored" and "fresh" AI test modes
"""
from enum import Enum
from typing import Optional
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from app.speaking.models import TestSession, Question, Answer


class Stage(str, Enum):
    PART1 = "part1"
    PART2 = "part2"
    PART3 = "part3"
    DONE = "done"


def calculate_band(p1_avg: float, p2_score: float, p3_avg: float) -> float:
    """
    Calculate overall IELTS Speaking band score.

    Formula (migrated from ielts_flow.py):
        Part2_3 combined = Part2 * 0.4 + Part3 * 0.6
        Overall = Part1 * 0.3 + Part2_3_combined * 0.7

    Returns band rounded to nearest 0.5.
    """
    p2_3_combined = p2_score * 0.4 + p3_avg * 0.6
    overall = p1_avg * 0.3 + p2_3_combined * 0.7
    # Round to nearest 0.5 (IELTS convention)
    return round(overall * 2) / 2


def create_session(
    db: Session,
    mode: str,
    test_data: dict,
    practice_part: Optional[int] = None,
) -> tuple[TestSession, list[Question]]:
    """
    Create a new TestSession and Question rows from a test data dict.

    practice_part: 1, 2, or 3 to store only that part. None = full mock (all parts).
    """
    if practice_part is not None and practice_part not in (1, 2, 3):
        raise ValueError("practice_part must be 1, 2, 3, or None")

    base_title = test_data.get("title", "IELTS Speaking Practice")
    title = f"Part {practice_part} Practice — {base_title}" if practice_part else base_title
    include = {practice_part} if practice_part else {1, 2, 3}

    session = TestSession(
        id=str(uuid.uuid4()),
        mode=mode,
        test_id=test_data.get("id"),
        title=title,
        practice_part=practice_part,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    db.add(session)
    db.flush()

    questions = []

    if 1 in include:
        for idx, q_text in enumerate(test_data.get("part1", [])):
            q = Question(
                session_id=session.id,
                part=1,
                order_idx=idx,
                question_text=q_text,
            )
            db.add(q)
            questions.append(q)

    if 2 in include:
        part2 = test_data.get("part2", {}) or {}
        q2 = Question(
            session_id=session.id,
            part=2,
            order_idx=0,
            question_text=part2.get("topic", ""),
            cue_card_topic=part2.get("topic", ""),
        )
        q2.cue_card_bullets = part2.get("bullets", [])
        db.add(q2)
        questions.append(q2)

    if 3 in include:
        for idx, q_text in enumerate(test_data.get("part3", [])):
            q = Question(
                session_id=session.id,
                part=3,
                order_idx=idx,
                question_text=q_text,
            )
            db.add(q)
            questions.append(q)

    if not questions:
        db.rollback()
        raise ValueError("No questions available for this practice part.")

    db.commit()
    db.refresh(session)
    return session, questions


def get_current_question(db: Session, session_id: str) -> Optional[Question]:
    """Return the next unanswered question in the session."""
    session = db.query(TestSession).filter_by(id=session_id).first()
    if not session or session.status != "in_progress":
        return None

    # Get all questions for this session, ordered by part then order_idx
    all_questions = (
        db.query(Question)
        .filter_by(session_id=session_id)
        .order_by(Question.part, Question.order_idx)
        .all()
    )

    # Get answered question IDs
    answered_ids = {
        a.question_id
        for a in db.query(Answer).filter_by(session_id=session_id).all()
    }

    for q in all_questions:
        if q.id not in answered_ids:
            return q

    return None  # All answered


def get_session_progress(db: Session, session_id: str) -> dict:
    """Return structured progress info for the session."""
    session = db.query(TestSession).filter_by(id=session_id).first()
    questions = (
        db.query(Question)
        .filter_by(session_id=session_id)
        .order_by(Question.part, Question.order_idx)
        .all()
    )
    answers = db.query(Answer).filter_by(session_id=session_id).all()
    answered_ids = {a.question_id for a in answers}

    part1_qs = [q for q in questions if q.part == 1]
    part2_qs = [q for q in questions if q.part == 2]
    part3_qs = [q for q in questions if q.part == 3]

    return {
        "total_part1": len(part1_qs),
        "total_part2": len(part2_qs),
        "total_part3": len(part3_qs),
        "answered_part1": sum(1 for q in part1_qs if q.id in answered_ids),
        "answered_part2": sum(1 for q in part2_qs if q.id in answered_ids),
        "answered_part3": sum(1 for q in part3_qs if q.id in answered_ids),
        "practice_part": session.practice_part if session else None,
    }


def save_answer(
    db: Session,
    session_id: str,
    question_id: str,
    transcript: str,
    duration: Optional[float],
    word_count: Optional[int],
    filler_count: Optional[int],
    words_per_minute: Optional[float],
) -> Answer:
    """Persist a transcribed answer to the DB."""
    answer = Answer(
        session_id=session_id,
        question_id=question_id,
        transcript=transcript,
        audio_duration=duration,
        word_count=word_count,
        filler_count=filler_count,
        words_per_minute=words_per_minute,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return answer


def is_session_complete(db: Session, session_id: str) -> bool:
    """Return True if all questions in the session have been answered."""
    total = db.query(Question).filter_by(session_id=session_id).count()
    answered = db.query(Answer).filter_by(session_id=session_id).count()
    return total > 0 and answered >= total


def complete_session(db: Session, session_id: str, estimated_band: Optional[float] = None):
    """Mark the session as completed."""
    session = db.query(TestSession).filter_by(id=session_id).first()
    if session:
        session.status = "completed"
        session.completed_at = datetime.utcnow()
        if estimated_band is not None:
            session.estimated_band = estimated_band
        db.commit()


def build_full_transcript(db: Session, session_id: str) -> list[dict]:
    """
    Build a structured list of all Q&A pairs for the session.
    Used as input to the MiniMax evaluation prompt.
    """
    questions = (
        db.query(Question)
        .filter_by(session_id=session_id)
        .order_by(Question.part, Question.order_idx)
        .all()
    )
    answers = {a.question_id: a for a in db.query(Answer).filter_by(session_id=session_id).all()}

    transcript = []
    for q in questions:
        ans = answers.get(q.id)
        transcript.append({
            "part": q.part,
            "question_text": q.question_text,
            "cue_card_topic": q.cue_card_topic,
            "cue_card_bullets": q.cue_card_bullets,
            "transcript": ans.transcript if ans else "",
            "duration": ans.audio_duration if ans else None,
            "word_count": ans.word_count if ans else None,
            "filler_count": ans.filler_count if ans else None,
            "words_per_minute": ans.words_per_minute if ans else None,
        })

    return transcript
