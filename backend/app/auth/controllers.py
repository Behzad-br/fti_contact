from __future__ import annotations

import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.auth.models import Batch, Branch, User
from app.auth.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.security_hardening import client_ip, login_limiter, rate_limit_or_429

router = APIRouter(prefix="/auth", tags=["auth"])
org_router = APIRouter(prefix="/org", tags=["org"])


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=6)
    role: Optional[str] = None  # optional hint: student|teacher|branch_admin|super_admin


class UserCreate(BaseModel):
    role: str
    email: str
    username: str
    password: str = Field(min_length=6)
    full_name: str = ""
    branch_id: str = ""
    batch: str = ""
    batches: str = ""


class UserPatch(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6)
    full_name: Optional[str] = None
    branch_id: Optional[str] = None
    batch: Optional[str] = None
    batches: Optional[str] = None
    is_active: Optional[bool] = None


class BranchAdminBody(BaseModel):
    name: str = ""
    username: str = Field(min_length=3)
    password: str = Field(default="", min_length=0)
    email: Optional[str] = None


class BranchBody(BaseModel):
    name: str
    city: str = ""
    image_url: str = ""
    id: Optional[str] = None
    admins: list[BranchAdminBody] = Field(default_factory=list)


class BatchBody(BaseModel):
    name: str
    schedule: str = ""
    subjects: str = ""
    branch_id: str = ""
    teacher_id: str = ""
    id: Optional[str] = None


def _slug(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or f"id-{uuid.uuid4().hex[:8]}"
    return base[:48]


def _public_user(u: User) -> dict:
    return {
        "id": u.id,
        "role": u.role,
        "email": u.email,
        "username": u.username,
        "full_name": u.full_name or u.username,
        "name": u.full_name or u.username,
        "branch_id": u.branch_id or "",
        "branchId": u.branch_id or "",
        "batch": u.batch or "",
        "batches": u.batches or "",
        "is_active": bool(u.is_active),
    }


def _branch_admin_email(username: str, email: Optional[str], branch_id: str) -> str:
    raw = (email or "").strip().lower()
    if raw:
        return raw
    return f"{username.strip().lower()}@{_slug(branch_id) or 'branch'}.fti.local"


def _public_branch(db: Session, b: Branch) -> dict:
    teachers = db.query(User).filter_by(role="teacher", branch_id=b.id, is_active=True).count()
    students = db.query(User).filter_by(role="student", branch_id=b.id, is_active=True).count()
    admins = (
        db.query(User)
        .filter_by(role="branch_admin", branch_id=b.id, is_active=True)
        .order_by(User.full_name.asc())
        .all()
    )
    return {
        "id": b.id,
        "name": b.name,
        "city": b.city or "",
        "imageUrl": b.image_url or "",
        "teachers": teachers,
        "students": students,
        "avg": 0,
        "admins": [{"name": a.full_name, "username": a.username, "password": ""} for a in admins],
        "admin": admins[0].full_name if admins else "",
        "adminUsername": admins[0].username if admins else "",
        "adminPassword": "",
    }


def _assert_unique_login(db: Session, *, email: str, username: str, exclude_user_id: Optional[str] = None) -> None:
    q = db.query(User).filter((User.email == email) | (User.username == username))
    if exclude_user_id:
        q = q.filter(User.id != exclude_user_id)
    if q.first():
        raise HTTPException(409, "Email or username already exists.")


def _create_branch_admin(
    db: Session,
    *,
    branch_id: str,
    admin: BranchAdminBody,
    require_password: bool,
) -> User:
    username = admin.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "Admin username must be at least 3 characters.")
    password = (admin.password or "").strip()
    if require_password and len(password) < 6:
        raise HTTPException(400, f"Password for @{username} must be at least 6 characters.")
    if password and len(password) < 6:
        raise HTTPException(400, f"Password for @{username} must be at least 6 characters.")
    email = _branch_admin_email(username, admin.email, branch_id)
    _assert_unique_login(db, email=email, username=username)
    row = User(
        id=str(uuid.uuid4()),
        role="branch_admin",
        email=email,
        username=username,
        password_hash=hash_password(password),
        full_name=(admin.name or username).strip() or username,
        branch_id=branch_id,
        is_active=True,
    )
    db.add(row)
    return row


def _find_login(db: Session, key: str, role: Optional[str]) -> Optional[User]:
    key = key.strip().lower()
    q = db.query(User)
    if role:
        role_map = {
            "student": "student",
            "teacher": "teacher",
            "branch-admin": "branch_admin",
            "branch_admin": "branch_admin",
            "admin": "super_admin",
            "super_admin": "super_admin",
            "super-admin": "super_admin",
        }
        mapped = role_map.get(role.strip().lower())
        if mapped:
            q = q.filter(User.role == mapped)
    return q.filter((User.email == key) | (User.username == key)).first()


@router.post("/login")
def login(body: LoginBody, request: Request, db: Session = Depends(get_db)):
    rate_limit_or_429(login_limiter, f"login:{client_ip(request)}")
    user = _find_login(db, body.username, body.role)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username/email or password.")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled.")
    token = create_access_token(sub=user.id, role=user.role, extra={"branch_id": user.branch_id or ""})
    return {"access_token": token, "token_type": "bearer", "user": _public_user(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _public_user(user)


@router.post("/change-password")
def change_password(
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = str(body.get("current_password") or "")
    new = str(body.get("new_password") or "")
    if len(new) < 6:
        raise HTTPException(400, "New password must be at least 6 characters.")
    if not verify_password(current, user.password_hash):
        raise HTTPException(400, "Current password is wrong.")
    user.password_hash = hash_password(new)
    db.commit()
    return {"ok": True}


@org_router.get("/users")
def list_users(
    role: Optional[str] = None,
    branch_id: Optional[str] = None,
    user: User = Depends(require_roles("super_admin", "branch_admin", "teacher")),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if user.role == "branch_admin":
        q = q.filter(User.branch_id == user.branch_id)
    elif user.role == "teacher":
        q = q.filter(User.role == "student", User.branch_id == user.branch_id)
    elif branch_id:
        q = q.filter(User.branch_id == branch_id)
    rows = q.order_by(User.full_name.asc()).all()
    return {"users": [_public_user(u) for u in rows]}


@org_router.post("/users")
def create_user(
    body: UserCreate,
    actor: User = Depends(require_roles("super_admin", "branch_admin", "teacher")),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower().replace("-", "_")
    if role not in {"super_admin", "branch_admin", "teacher", "student"}:
        raise HTTPException(400, "Invalid role.")
    if actor.role == "teacher" and role != "student":
        raise HTTPException(403, "Teachers can only create students.")
    if actor.role == "branch_admin" and role in {"super_admin"}:
        raise HTTPException(403, "Not allowed.")
    email = body.email.strip().lower()
    username = body.username.strip().lower()
    if db.query(User).filter((User.email == email) | (User.username == username)).first():
        raise HTTPException(409, "Email or username already exists.")
    branch_id = body.branch_id or (actor.branch_id if actor.role != "super_admin" else "")
    row = User(
        id=str(uuid.uuid4()),
        role=role,
        email=email,
        username=username,
        password_hash=hash_password(body.password),
        full_name=(body.full_name or username).strip(),
        branch_id=branch_id,
        batch=body.batch or "",
        batches=body.batches or "",
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _public_user(row)


@org_router.patch("/users/{user_id}")
def patch_user(
    user_id: str,
    body: UserPatch,
    actor: User = Depends(require_roles("super_admin", "branch_admin", "teacher")),
    db: Session = Depends(get_db),
):
    row = db.query(User).filter_by(id=user_id).first()
    if not row:
        raise HTTPException(404, "User not found.")
    if actor.role == "teacher" and row.role != "student":
        raise HTTPException(403, "Not allowed.")
    if actor.role == "branch_admin" and row.branch_id != actor.branch_id:
        raise HTTPException(403, "Wrong branch.")
    if body.email is not None:
        email = body.email.strip().lower()
        _assert_unique_login(db, email=email, username=row.username, exclude_user_id=row.id)
        row.email = email
    if body.username is not None:
        username = body.username.strip().lower()
        _assert_unique_login(db, email=row.email, username=username, exclude_user_id=row.id)
        row.username = username
    if body.full_name is not None:
        row.full_name = body.full_name.strip()
    if body.branch_id is not None and actor.role == "super_admin":
        row.branch_id = body.branch_id
    if body.batch is not None:
        row.batch = body.batch
    if body.batches is not None:
        row.batches = body.batches
    if body.is_active is not None and actor.role in {"super_admin", "branch_admin"}:
        row.is_active = body.is_active
    if body.password:
        row.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(row)
    return _public_user(row)


@org_router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    actor: User = Depends(require_roles("super_admin", "branch_admin", "teacher")),
    db: Session = Depends(get_db),
):
    row = db.query(User).filter_by(id=user_id).first()
    if not row:
        raise HTTPException(404, "User not found.")
    if row.id == actor.id:
        raise HTTPException(400, "Cannot delete your own account.")
    if actor.role == "teacher" and row.role != "student":
        raise HTTPException(403, "Not allowed.")
    if actor.role == "branch_admin" and row.branch_id != actor.branch_id:
        raise HTTPException(403, "Wrong branch.")
    row.is_active = False
    db.commit()
    return {"ok": True}


@org_router.get("/branches")
def list_branches(
    user: User = Depends(require_roles("super_admin", "branch_admin", "teacher", "student")),
    db: Session = Depends(get_db),
):
    q = db.query(Branch)
    if user.role != "super_admin" and user.branch_id:
        q = q.filter(Branch.id == user.branch_id)
    rows = q.order_by(Branch.name.asc()).all()
    return {"branches": [_public_branch(db, b) for b in rows]}


@org_router.post("/branches")
def create_branch(
    body: BranchBody,
    _: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    if not body.admins:
        raise HTTPException(400, "At least one branch admin is required.")
    bid = (body.id or _slug(body.name)).strip()
    if db.query(Branch).filter_by(id=bid).first():
        raise HTTPException(409, "Branch id already exists.")

    # Pre-check duplicate usernames inside the request itself.
    seen: set[str] = set()
    for admin in body.admins:
        key = admin.username.strip().lower()
        if key in seen:
            raise HTTPException(400, f"Username @{key} is used twice on this campus.")
        seen.add(key)

    row = Branch(id=bid, name=body.name.strip(), city=body.city.strip(), image_url=body.image_url or "")
    db.add(row)
    try:
        for admin in body.admins:
            _create_branch_admin(db, branch_id=bid, admin=admin, require_password=True)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
    db.refresh(row)
    return _public_branch(db, row)


@org_router.put("/branches/{branch_id}")
def update_branch(
    branch_id: str,
    body: BranchBody,
    _: User = Depends(require_roles("super_admin")),
    db: Session = Depends(get_db),
):
    row = db.query(Branch).filter_by(id=branch_id).first()
    if not row:
        raise HTTPException(404, "Branch not found.")
    if not body.admins:
        raise HTTPException(400, "At least one branch admin is required.")

    seen: set[str] = set()
    for admin in body.admins:
        key = admin.username.strip().lower()
        if key in seen:
            raise HTTPException(400, f"Username @{key} is used twice on this campus.")
        seen.add(key)

    row.name = body.name.strip()
    row.city = body.city.strip()
    if body.image_url is not None:
        row.image_url = body.image_url or ""

    existing = (
        db.query(User)
        .filter_by(role="branch_admin", branch_id=branch_id)
        .all()
    )
    by_username = {u.username.lower(): u for u in existing}
    keep: set[str] = set()

    try:
        for admin in body.admins:
            username = admin.username.strip().lower()
            current = by_username.get(username)
            if current:
                keep.add(current.id)
                current.full_name = (admin.name or current.full_name or username).strip()
                current.is_active = True
                if admin.email:
                    email = admin.email.strip().lower()
                    _assert_unique_login(db, email=email, username=username, exclude_user_id=current.id)
                    current.email = email
                password = (admin.password or "").strip()
                if password:
                    if len(password) < 6:
                        raise HTTPException(400, f"Password for @{username} must be at least 6 characters.")
                    current.password_hash = hash_password(password)
            else:
                created = _create_branch_admin(db, branch_id=branch_id, admin=admin, require_password=True)
                keep.add(created.id)

        for user in existing:
            if user.id not in keep:
                user.is_active = False

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    db.refresh(row)
    return _public_branch(db, row)


@org_router.get("/batches")
def list_batches(
    branch_id: Optional[str] = None,
    user: User = Depends(require_roles("super_admin", "branch_admin", "teacher", "student")),
    db: Session = Depends(get_db),
):
    q = db.query(Batch)
    scope = branch_id or (user.branch_id if user.role != "super_admin" else None)
    if scope:
        q = q.filter(Batch.branch_id == scope)
    rows = q.order_by(Batch.name.asc()).all()
    return {
        "batches": [
            {
                "id": b.id,
                "name": b.name,
                "schedule": b.schedule or "",
                "subjects": b.subjects or "",
                "branchId": b.branch_id or "",
                "teacherId": b.teacher_id or "",
                "students": db.query(User).filter_by(role="student", batch=b.name, is_active=True).count(),
                "avg": "—",
            }
            for b in rows
        ]
    }


@org_router.post("/batches")
def create_batch(
    body: BatchBody,
    actor: User = Depends(require_roles("super_admin", "branch_admin")),
    db: Session = Depends(get_db),
):
    branch_id = body.branch_id or actor.branch_id
    if actor.role == "branch_admin" and branch_id != actor.branch_id:
        raise HTTPException(403, "Wrong branch.")
    row = Batch(
        id=body.id or str(uuid.uuid4()),
        name=body.name.strip(),
        schedule=body.schedule or "",
        subjects=body.subjects or "",
        branch_id=branch_id or "",
        teacher_id=body.teacher_id or "",
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "name": row.name, "branchId": row.branch_id, "teacherId": row.teacher_id}
