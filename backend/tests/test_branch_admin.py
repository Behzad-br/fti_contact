"""Branch creation + branch_admin credential/login flow."""
import uuid

from app.auth.models import Branch, User
from app.auth.security import create_access_token, hash_password, verify_password
from tests.conftest import _TestSessionFactory


def _super_headers() -> dict:
    db = _TestSessionFactory()
    try:
        uid = f"sa-{uuid.uuid4().hex[:10]}"
        admin = User(
            id=uid,
            role="super_admin",
            email=f"{uid}@test.com",
            username=uid,
            password_hash=hash_password("SuperAdmin1!"),
            full_name="Super Admin",
            is_active=True,
        )
        db.add(admin)
        db.commit()
        token = create_access_token(sub=admin.id, role=admin.role)
        return {"Authorization": f"Bearer {token}"}
    finally:
        db.close()


def _user_row(username: str):
    db = _TestSessionFactory()
    try:
        u = db.query(User).filter_by(username=username).first()
        if not u:
            return None
        return {
            "role": u.role,
            "branch_id": u.branch_id,
            "password_hash": u.password_hash,
            "full_name": u.full_name,
        }
    finally:
        db.close()


def _branch_row(branch_id: str):
    db = _TestSessionFactory()
    try:
        b = db.query(Branch).filter_by(id=branch_id).first()
        if not b:
            return None
        return {"id": b.id, "name": b.name}
    finally:
        db.close()


def test_create_branch_with_admin_login_and_isolation(client):
    headers = _super_headers()
    suffix = uuid.uuid4().hex[:8]
    admin_user = f"lahore_admin_{suffix}"
    other_user = f"karachi_admin_{suffix}"

    created = client.post(
        "/api/org/branches",
        headers=headers,
        json={
            "name": f"Lahore Campus {suffix}",
            "city": "Lahore",
            "admins": [
                {
                    "name": "Lahore Admin",
                    "username": admin_user,
                    "password": "CampusPass1!",
                }
            ],
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["id"]
    assert body["adminUsername"] == admin_user
    assert body["adminPassword"] == ""
    assert body["admins"][0]["password"] == ""

    branch = _branch_row(body["id"])
    assert branch is not None
    assert branch["name"] == f"Lahore Campus {suffix}"

    admin = _user_row(admin_user)
    assert admin is not None
    assert admin["role"] == "branch_admin"
    assert admin["branch_id"] == body["id"]
    assert admin["password_hash"].startswith("pbkdf2_sha256$")
    assert verify_password("CampusPass1!", admin["password_hash"])
    assert "CampusPass1!" not in admin["password_hash"]

    bad = client.post(
        "/api/auth/login",
        json={"username": admin_user, "password": "wrong-password", "role": "branch_admin"},
    )
    assert bad.status_code == 401

    ok = client.post(
        "/api/auth/login",
        json={"username": admin_user, "password": "CampusPass1!", "role": "branch_admin"},
    )
    assert ok.status_code == 200
    login = ok.json()
    assert login["access_token"]
    assert login["user"]["role"] == "branch_admin"
    assert login["user"]["branch_id"] == body["id"]
    assert login["user"]["branchId"] == body["id"]

    other = client.post(
        "/api/org/branches",
        headers=headers,
        json={
            "name": f"Karachi Campus {suffix}",
            "city": "Karachi",
            "admins": [{"name": "Karachi Admin", "username": other_user, "password": "CampusPass2!"}],
        },
    ).json()

    ba_headers = {"Authorization": f"Bearer {login['access_token']}"}
    listed = client.get("/api/org/branches", headers=ba_headers)
    assert listed.status_code == 200
    branch_ids = [b["id"] for b in listed.json()["branches"]]
    assert body["id"] in branch_ids
    assert other["id"] not in branch_ids

    users = client.get("/api/org/users", headers=ba_headers)
    assert users.status_code == 200
    for row in users.json()["users"]:
        assert row["branch_id"] == body["id"]


def test_create_branch_requires_admin_and_rejects_duplicate_username(client):
    headers = _super_headers()
    suffix = uuid.uuid4().hex[:8]
    shared = f"isb_admin_{suffix}"

    missing = client.post(
        "/api/org/branches",
        headers=headers,
        json={"name": f"Empty Admins {suffix}", "city": "X", "admins": []},
    )
    assert missing.status_code == 400

    first = client.post(
        "/api/org/branches",
        headers=headers,
        json={
            "name": f"Islamabad Campus {suffix}",
            "city": "Islamabad",
            "admins": [{"name": "Isb Admin", "username": shared, "password": "CampusPass3!"}],
        },
    )
    assert first.status_code == 200

    dup = client.post(
        "/api/org/branches",
        headers=headers,
        json={
            "name": f"Rawalpindi Campus {suffix}",
            "city": "Rawalpindi",
            "admins": [{"name": "Clone", "username": shared, "password": "CampusPass4!"}],
        },
    )
    assert dup.status_code == 409
    assert _branch_row(f"rawalpindi-campus-{suffix}") is None


def test_update_branch_can_reset_admin_password(client):
    headers = _super_headers()
    suffix = uuid.uuid4().hex[:8]
    admin_user = f"multan_admin_{suffix}"

    created = client.post(
        "/api/org/branches",
        headers=headers,
        json={
            "name": f"Multan Campus {suffix}",
            "city": "Multan",
            "admins": [{"name": "Multan Admin", "username": admin_user, "password": "OldPass99!"}],
        },
    ).json()

    updated = client.put(
        f"/api/org/branches/{created['id']}",
        headers=headers,
        json={
            "name": f"Multan Campus {suffix}",
            "city": "Multan",
            "admins": [{"name": "Multan Admin", "username": admin_user, "password": "NewPass99!"}],
        },
    )
    assert updated.status_code == 200

    old = client.post(
        "/api/auth/login",
        json={"username": admin_user, "password": "OldPass99!", "role": "branch_admin"},
    )
    assert old.status_code == 401

    new = client.post(
        "/api/auth/login",
        json={"username": admin_user, "password": "NewPass99!", "role": "branch_admin"},
    )
    assert new.status_code == 200
    assert new.json()["user"]["branch_id"] == created["id"]
