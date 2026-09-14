"""
tests/test_session.py — Test IELTS Speaking session creation and progression.
"""
import pytest
from app.speaking.services import speaking_session
from app.speaking.models import TestSession, Question, Answer

_SAMPLE_TEST = {
    "id": "test-001",
    "title": "Test Session",
    "part1": ["Q1", "Q2", "Q3"],
    "part2": {"topic": "Describe something", "bullets": ["point1", "point2"]},
    "part3": ["P3Q1", "P3Q2", "P3Q3"],
}


def test_create_session(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    assert session.id is not None
    assert session.mode == "stored"
    assert session.status == "in_progress"
    # 3 part1 + 1 part2 + 3 part3 = 7 questions
    assert len(questions) == 7


def test_first_question_is_part1(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    first = speaking_session.get_current_question(db, session.id)
    assert first is not None
    assert first.part == 1
    assert first.order_idx == 0


def test_session_progress_empty(db):
    session, _ = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    progress = speaking_session.get_session_progress(db, session.id)
    assert progress["total_part1"] == 3
    assert progress["total_part2"] == 1
    assert progress["total_part3"] == 3
    assert progress["answered_part1"] == 0


def test_answer_advances_to_next_question(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    q1 = next(q for q in questions if q.part == 1 and q.order_idx == 0)
    q2 = next(q for q in questions if q.part == 1 and q.order_idx == 1)

    speaking_session.save_answer(db, session.id, q1.id, "My answer", 15.0, 10, 0, 40.0)

    next_q = speaking_session.get_current_question(db, session.id)
    assert next_q.id == q2.id


def test_part1_to_part2_transition(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    part1_qs = sorted([q for q in questions if q.part == 1], key=lambda q: q.order_idx)

    # Answer all Part 1 questions
    for q in part1_qs:
        speaking_session.save_answer(db, session.id, q.id, "Answer", 10.0, 5, 0, 30.0)

    # Next question should be Part 2
    next_q = speaking_session.get_current_question(db, session.id)
    assert next_q is not None
    assert next_q.part == 2


def test_session_complete_after_all_answers(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)

    assert not speaking_session.is_session_complete(db, session.id)

    for q in questions:
        speaking_session.save_answer(db, session.id, q.id, "Answer", 10.0, 5, 0, 30.0)

    assert speaking_session.is_session_complete(db, session.id)


def test_complete_session(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    for q in questions:
        speaking_session.save_answer(db, session.id, q.id, "Answer", 10.0, 5, 0, 30.0)

    speaking_session.complete_session(db, session.id, estimated_band=6.5)
    refreshed = db.query(TestSession).filter_by(id=session.id).first()
    assert refreshed.status == "completed"
    assert refreshed.estimated_band == 6.5


def test_build_full_transcript(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    for i, q in enumerate(questions):
        speaking_session.save_answer(db, session.id, q.id, f"Answer {i}", 10.0, 5, 0, 30.0)

    transcript = speaking_session.build_full_transcript(db, session.id)
    assert len(transcript) == 7
    for item in transcript:
        assert item["transcript"].startswith("Answer")


def test_calculate_band():
    from app.speaking.services.speaking_session import calculate_band
    result = calculate_band(6.0, 6.5, 6.0)
    assert result == 6.0 or result == 6.1  # Rounds to nearest 0.5
    # Exact: (6.5*0.4 + 6.0*0.6)*0.7 + 6.0*0.3 = (2.6+3.6)*0.7 + 1.8 = 6.14 → 6.0
    assert calculate_band(6.0, 6.5, 6.0) == 6.0


def test_part1_only_practice(db):
    session, questions = speaking_session.create_session(
        db, "stored", _SAMPLE_TEST, practice_part=1
    )
    assert session.practice_part == 1
    assert all(q.part == 1 for q in questions)
    assert len(questions) == 3
    assert session.title.startswith("Part 1 Practice")
    first = speaking_session.get_current_question(db, session.id)
    assert first.part == 1
    for q in questions:
        speaking_session.save_answer(db, session.id, q.id, "Answer", 10.0, 5, 0, 30.0)
    assert speaking_session.is_session_complete(db, session.id)
    assert speaking_session.get_current_question(db, session.id) is None


def test_part2_only_practice(db):
    session, questions = speaking_session.create_session(
        db, "stored", _SAMPLE_TEST, practice_part=2
    )
    assert len(questions) == 1
    assert questions[0].part == 2
    first = speaking_session.get_current_question(db, session.id)
    assert first.part == 2


def test_part3_only_practice(db):
    session, questions = speaking_session.create_session(
        db, "stored", _SAMPLE_TEST, practice_part=3
    )
    assert all(q.part == 3 for q in questions)
    assert len(questions) == 3
    first = speaking_session.get_current_question(db, session.id)
    assert first.part == 3
