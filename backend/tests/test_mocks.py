from datetime import datetime, timedelta

from app.writing.models import WritingQuestion


def _headers(student="s1", teacher="t-lahore-1"):
    return {
        "X-Student-Id": student,
        "X-Student-Aliases": f"{student},local" if student in {"s1", "local"} else student,
        "X-Teacher-Id": teacher,
        "X-Admin-Token": "",
    }


def _writing_questions(db):
    q1 = db.query(WritingQuestion).filter_by(public_id="MOCK-T1-001").first()
    q2 = db.query(WritingQuestion).filter_by(public_id="MOCK-T2-001").first()
    if q1 and q2:
        return q1, q2
    q1 = WritingQuestion(
        public_id="MOCK-T1-001",
        test_type="academic",
        task_number=1,
        question_type="bar_chart",
        topic="transport",
        prompt="The chart shows buses.",
        minimum_words=150,
        recommended_minutes=20,
        status="published",
        is_permanent_bank=True,
        source_type="original_generated",
    )
    q2 = WritingQuestion(
        public_id="MOCK-T2-001",
        test_type="academic",
        task_number=2,
        question_type="opinion",
        topic="education",
        prompt="Some people prefer buses.",
        minimum_words=250,
        recommended_minutes=40,
        status="published",
        is_permanent_bank=True,
        source_type="original_generated",
    )
    db.add_all([q1, q2])
    db.commit()
    db.refresh(q1)
    db.refresh(q2)
    return q1, q2


def test_assign_is_visible_only_to_selected_students(client):
    headers = _headers()
    created = client.post(
        "/api/mocks/assignments",
        headers=headers,
        json={
            "title": "IELTS Academic Mock 05",
            "mock_type": "writing",
            "ielts_type": "academic",
            "assign_mode": "selected",
            "batch_label": "Morning Batch A",
            "duration_minutes": 60,
            "available_at": (datetime.utcnow() - timedelta(minutes=1)).isoformat() + "Z",
            "teacher_name": "Nadia Rahman",
            "students": [{"id": "s1", "name": "Ali Ahmad"}],
        },
    )
    assert created.status_code == 200, created.text
    assignment_id = created.json()["id"]

    ali = client.get("/api/mocks/student/inbox", headers=_headers("s1"))
    assert ali.status_code == 200
    assert any(item["id"] == assignment_id for item in ali.json()["items"])

    other = client.get("/api/mocks/student/inbox", headers=_headers("s2"))
    assert other.status_code == 200
    assert all(item["id"] != assignment_id for item in other.json()["items"])

    notes = client.get("/api/notifications", headers=_headers("s1"))
    assert notes.status_code == 200
    assert notes.json()["items"]


def test_upcoming_cannot_start_until_available(client, db):
    q1, q2 = _writing_questions(db)
    headers = _headers()
    future = (datetime.utcnow() + timedelta(days=2)).isoformat() + "Z"
    created = client.post(
        "/api/mocks/assignments",
        headers=headers,
        json={
            "title": "Future mock",
            "mock_type": "writing",
            "ielts_type": "academic",
            "duration_minutes": 60,
            "available_at": future,
            "paper_refs": {"task1_id": q1.id, "task2_id": q2.id},
            "students": [{"id": "s1", "name": "Ali Ahmad"}],
        },
    )
    assert created.status_code == 200
    assignment_id = created.json()["id"]
    inbox = client.get("/api/mocks/student/inbox", headers=headers).json()["items"]
    row = next(item for item in inbox if item["id"] == assignment_id)
    assert row["inbox_status"] == "upcoming"
    start = client.post("/api/mocks/attempts/start", headers=headers, json={"assignment_id": assignment_id, "consent": True})
    assert start.status_code == 400


def test_autosave_and_teacher_publish(client, db):
    q1, q2 = _writing_questions(db)
    headers = _headers()
    created = client.post(
        "/api/mocks/assignments",
        headers=headers,
        json={
            "title": "Writing mock",
            "mock_type": "writing",
            "ielts_type": "academic",
            "duration_minutes": 60,
            "available_at": (datetime.utcnow() - timedelta(minutes=1)).isoformat() + "Z",
            "paper_refs": {"task1_id": q1.id, "task2_id": q2.id},
            "students": [{"id": "s1", "name": "Ali Ahmad"}],
        },
    )
    assignment_id = created.json()["id"]
    start = client.post("/api/mocks/attempts/start", headers=headers, json={"assignment_id": assignment_id, "consent": True})
    assert start.status_code == 200, start.text
    attempt_id = start.json()["attempt_id"]
    save = client.post(
        f"/api/mocks/attempts/{attempt_id}/answers",
        headers=headers,
        json={"answers": [{"question_key": "task2", "value": "Draft paragraph"}], "client_seq": 1},
    )
    assert save.status_code == 200
    submit = client.post(f"/api/mocks/attempts/{attempt_id}/submit", headers=headers, json={})
    assert submit.status_code == 200
    review = client.post(
        f"/api/mocks/attempts/{attempt_id}/review",
        headers=headers,
        json={"writing_band": 6.0, "reading_band": 6.5, "listening_band": 7.0, "speaking_band": 6.5, "publish": True},
    )
    assert review.status_code == 200
    assert review.json()["published"] is True
    inbox = client.get("/api/mocks/student/inbox", headers=headers).json()["items"]
    row = next(item for item in inbox if item["id"] == assignment_id)
    assert row["inbox_status"] == "results"
    assert row["overall_band"] is not None


def test_livekit_token_missing_assignment_is_not_found(client):
    response = client.post("/api/mocks/livekit/token", headers=_headers(), json={"role": "student"})
    assert response.status_code in (200, 404)
    if response.status_code == 200:
        assert response.json().get("enabled") is False


def test_manual_assign_and_ai_result_mode(client, db):
    headers = _headers()
    created = client.post(
        "/api/mocks/assignments",
        headers=headers,
        json={
            "title": "Manual Writing Cue",
            "mock_type": "writing",
            "ielts_type": "academic",
            "paper_source": "manual",
            "result_mode": "ai",
            "duration_minutes": 40,
            "available_at": (datetime.utcnow() - timedelta(minutes=1)).isoformat() + "Z",
            "students": [{"id": "s1", "name": "Ali Ahmad"}],
            "paper_refs": {"prompt": "Some people prefer trains. Discuss."},
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["paper_source"] == "manual"
    assert body["result_mode"] == "ai"
    assignment_id = body["id"]
    start = client.post("/api/mocks/attempts/start", headers=headers, json={"assignment_id": assignment_id, "consent": True})
    assert start.status_code == 200, start.text
    attempt_id = start.json()["attempt_id"]
    submit = client.post(f"/api/mocks/attempts/{attempt_id}/submit", headers=headers, json={})
    assert submit.status_code == 200
    assert submit.json()["published"] is True
    inbox = client.get("/api/mocks/student/inbox", headers=headers).json()["items"]
    row = next(item for item in inbox if item["id"] == assignment_id)
    assert row["inbox_status"] == "results"


def test_homework_route_still_lists(client):
    response = client.get("/api/homework/student", headers=_headers("local"))
    assert response.status_code == 200
    assert "assignments" in response.json()
