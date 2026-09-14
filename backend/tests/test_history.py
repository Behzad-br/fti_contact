"""
tests/test_history.py — Test history and progress API endpoints.
"""
import pytest
from datetime import datetime

from app.speaking.models import TestSession, Evaluation
from app.speaking.services import speaking_session


_SAMPLE_TEST = {
    "id": "test-001",
    "title": "History Test",
    "part1": ["Q1", "Q2", "Q3"],
    "part2": {"topic": "Describe something", "bullets": ["p1", "p2"]},
    "part3": ["P3Q1", "P3Q2", "P3Q3"],
}


def _make_completed_session(db):
    session, questions = speaking_session.create_session(db, "stored", _SAMPLE_TEST)
    for q in questions:
        speaking_session.save_answer(db, session.id, q.id, "An answer.", 10.0, 5, 0, 30.0)
    speaking_session.complete_session(db, session.id, estimated_band=6.5)
    return session


def test_history_endpoint_empty(client):
    response = client.get("/api/history")
    assert response.status_code == 200
    data = response.json()
    assert "sessions" in data
    assert "total" in data


def test_history_lists_completed_sessions(client):
    from tests.conftest import _TestSessionFactory
    s = _TestSessionFactory()
    try:
        session = _make_completed_session(s)
        session_id = session.id
        s.commit()
    finally:
        s.close()

    response = client.get("/api/history")
    assert response.status_code == 200
    data = response.json()
    session_ids = [s["session_id"] for s in data["sessions"]]
    assert session_id in session_ids


def test_get_session_result(client):
    from tests.conftest import _TestSessionFactory
    s = _TestSessionFactory()
    try:
        session = _make_completed_session(s)
        session_id = session.id
        s.commit()
    finally:
        s.close()

    response = client.get(f"/api/history/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == session_id
    assert data["status"] == "completed"
    assert data["answers"]
    assert "mark_cuts" in data["answers"][0]
    assert data["evaluation"] is not None
    assert data["evaluation"]["estimated_band"] is not None
    assert data["evaluation"]["estimated_band"] <= 5.5


def test_get_session_result_prefers_stored_ai_comments(client):
    from tests.conftest import _TestSessionFactory

    s = _TestSessionFactory()
    try:
        session = _make_completed_session(s)
        eval_row = Evaluation(
            session_id=session.id,
            fluency_coherence=5.0,
            lexical_resource=5.0,
            grammar=5.0,
            estimated_band=5.0,
            pronunciation="Not assessed in this version",
            detailed_feedback="AI heard short Part 1 answers and one grammar slip.",
            improvement_tips="Give a reason and an example after every Part 1 answer.",
        )
        eval_row.strengths = ["You stayed on the cue card in Part 2."]
        eval_row.weaknesses = ["Several answers were too short."]
        eval_row.corrections = [{"original": "I goed", "better": "I went", "explanation": "Past simple of go is went."}]
        eval_row.raw_ai_response = (
            '{"why_this_band":["You said only a few words on Q1."],'
            '"better_versions":[{"question":"Q1","you_said":"An answer.","say_it_like_this":"I work as a nurse and I enjoy helping people."}],'
            '"ai_status":"ai"}'
        )
        s.add(eval_row)
        session_id = session.id
        s.commit()
    finally:
        s.close()

    response = client.get(f"/api/history/{session_id}")
    assert response.status_code == 200
    data = response.json()
    ev = data["evaluation"]
    assert ev["detailed_feedback"] == "AI heard short Part 1 answers and one grammar slip."
    assert ev["why_this_band"] == ["You said only a few words on Q1."]
    assert ev["corrections"][0]["better"] == "I went"
    assert ev["better_versions"][0]["say_it_like_this"].startswith("I work as a nurse")
    assert data["answers"][0]["transcript"] == "An answer."


def test_get_session_result_not_found(client):
    response = client.get("/api/history/nonexistent-id-xyz")
    assert response.status_code == 404


def test_progress_endpoint(client):
    response = client.get("/api/progress")
    assert response.status_code == 200
    data = response.json()
    assert "total_tests" in data
    assert "recent_bands" in data
    assert isinstance(data["recurring_grammar_issues"], list)


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "database" in data
    assert "minimax_configured" in data
    assert "whisper_model" in data
