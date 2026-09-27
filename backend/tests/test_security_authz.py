"""High-value authz / IDOR / production-gate tests."""
from app.auth.models import User
from app.auth.security import create_access_token, hash_password
from app.config import settings
from app.speaking.services import speaking_session


_SAMPLE = {
    "id": "idor-test",
    "title": "IDOR Test",
    "part1": ["Q1"],
    "part2": {"topic": "Topic", "bullets": ["a"]},
    "part3": ["P3"],
}


def _token_for(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(sub=user.id, role=user.role)}"}


def test_speaking_requires_auth_when_legacy_off(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_LEGACY_HEADERS", False)
    assert client.get("/api/history").status_code == 401
    assert client.get("/api/tests/list").status_code == 401
    assert client.post("/api/tests/start", json={"mode": "stored"}).status_code == 401


def test_speaking_history_idor(client, db, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_LEGACY_HEADERS", False)
    a = User(
        id="stu-a",
        role="student",
        email="a@test.com",
        username="stu_a",
        password_hash=hash_password("Secret123!"),
        full_name="A",
        is_active=True,
    )
    b = User(
        id="stu-b",
        role="student",
        email="b@test.com",
        username="stu_b",
        password_hash=hash_password("Secret123!"),
        full_name="B",
        is_active=True,
    )
    db.add_all([a, b])
    db.commit()

    session, _ = speaking_session.create_session(db, "stored", _SAMPLE, student_id="stu-a")
    db.commit()

    # Owner can read
    ok = client.get(f"/api/history/{session.id}", headers=_token_for(a))
    assert ok.status_code == 200

    # Other student cannot
    denied = client.get(f"/api/history/{session.id}", headers=_token_for(b))
    assert denied.status_code == 403

    # Other student does not see it in list
    listed = client.get("/api/history", headers=_token_for(b))
    assert listed.status_code == 200
    assert session.id not in [row["session_id"] for row in listed.json()["sessions"]]


def test_disabled_user_cannot_login(client, db):
    user = User(
        id="disabled-1",
        role="student",
        email="disabled@test.com",
        username="disabled_user",
        password_hash=hash_password("Secret123!"),
        full_name="Disabled",
        is_active=False,
    )
    db.add(user)
    db.commit()

    res = client.post(
        "/api/auth/login",
        json={"username": "disabled_user", "password": "Secret123!"},
    )
    assert res.status_code == 403
