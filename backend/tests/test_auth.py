from app.auth.security import hash_password, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("Secret123!")
    assert hashed.startswith("pbkdf2_sha256$")
    assert verify_password("Secret123!", hashed)
    assert not verify_password("wrong", hashed)


def test_login_requires_user(client):
    response = client.post("/api/auth/login", json={"username": "nobody", "password": "password123"})
    assert response.status_code == 401


def test_bootstrap_and_login(client, db):
    from app.auth.bootstrap import ensure_bootstrap_admin
    from app.config import settings

    settings.AUTH_BOOTSTRAP_PASSWORD = "Admin@12345"
    settings.AUTH_BOOTSTRAP_USERNAME = "admin"
    ensure_bootstrap_admin(db)

    bad = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345", "role": "super_admin"})
    assert ok.status_code == 200
    body = ok.json()
    assert body["access_token"]
    assert body["user"]["role"] == "super_admin"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["username"] == "admin"
