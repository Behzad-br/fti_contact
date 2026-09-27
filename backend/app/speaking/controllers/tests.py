"""Test session controller."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import resolve_student_id as get_student_id
from app.database import get_db
from app.speaking.models import Question, TestSession
from app.speaking.ownership import assert_session_owner
from app.speaking.schemas import StartTestRequest, StartTestResponse
from app.speaking.services import question_bank, question_generator, speaking_session
from app.speaking.views import question_to_schema

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tests/list")
async def list_stored_tests(student_id: str = Depends(get_student_id)):
    _ = student_id  # auth gate — catalog itself is not secret, but LMS requires login
    tests = question_bank.list_tests()
    return {"tests": tests, "total": len(tests)}


@router.post("/tests/start", response_model=StartTestResponse)
async def start_test(
    request: StartTestRequest,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    if request.mode not in ("stored", "fresh"):
        raise HTTPException(status_code=400, detail="mode must be 'stored' or 'fresh'")
    if request.practice_part is not None and request.practice_part not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="practice_part must be 1, 2, or 3")

    if request.mode == "stored":
        if request.test_id:
            test_data = question_bank.get_test(request.test_id)
            if not test_data:
                raise HTTPException(
                    status_code=404,
                    detail=f"Test '{request.test_id}' not found in question bank.",
                )
        else:
            test_data = question_bank.get_random_test()
            if not test_data:
                raise HTTPException(
                    status_code=503,
                    detail="No stored tests available.",
                )
    else:
        recent = _get_recent_part2_topics(db, student_id, limit=5)
        try:
            test_data = await question_generator.generate_fresh_test(recent_topics=recent)
        except Exception as exc:
            logger.error("Fresh test generation failed: %s", exc)
            raise HTTPException(
                status_code=503,
                detail="AI question generation failed. Please try again later.",
            ) from exc

    session, questions = speaking_session.create_session(
        db, request.mode, test_data, practice_part=request.practice_part, student_id=student_id
    )

    ordered = sorted(questions, key=lambda q: (q.part, q.order_idx))
    if not ordered:
        raise HTTPException(status_code=500, detail="Session creation error: no questions.")

    progress = speaking_session.get_session_progress(db, session.id)
    return StartTestResponse(
        session_id=session.id,
        mode=session.mode,
        title=session.title or "IELTS Speaking Practice",
        practice_part=session.practice_part,
        first_question=question_to_schema(ordered[0]),
        total_part1=progress["total_part1"],
        total_part2=progress["total_part2"],
        total_part3=progress["total_part3"],
    )


@router.get("/tests/{session_id}")
async def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    session = db.query(TestSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    assert_session_owner(session, student_id)
    progress = speaking_session.get_session_progress(db, session_id)
    current = speaking_session.get_current_question(db, session_id)
    return {
        "session_id": session.id,
        "mode": session.mode,
        "title": session.title,
        "practice_part": session.practice_part,
        "status": session.status,
        "progress": progress,
        "current_question": question_to_schema(current) if current else None,
    }


def _get_recent_part2_topics(db: Session, student_id: str, limit: int = 5) -> list[str]:
    recent_sessions = (
        db.query(TestSession)
        .filter(TestSession.status == "completed", TestSession.student_id == student_id)
        .order_by(TestSession.completed_at.desc())
        .limit(limit)
        .all()
    )
    topics = []
    for s in recent_sessions:
        p2 = db.query(Question).filter_by(session_id=s.id, part=2, order_idx=0).first()
        if p2 and p2.cue_card_topic:
            topics.append(p2.cue_card_topic[:80])
    return topics
