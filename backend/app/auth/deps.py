from __future__ import annotations

from typing import Optional

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import decode_access_token
from app.config import settings
from app.database import get_db

_bearer = HTTPBearer(auto_error=False)


def _user_from_token(db: Session, token: str) -> User:
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")
    user_id = str(payload.get("sub") or "")
    user = db.query(User).filter_by(id=user_id).first()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive.")
    return user


def get_current_user(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(401, "Authentication required.")
    return _user_from_token(db, creds.credentials)


def get_optional_user(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[User]:
    if not creds or not creds.credentials:
        return None
    try:
        return _user_from_token(db, creds.credentials)
    except HTTPException:
        return None


def require_roles(*roles: str):
    allowed = set(roles)

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "Not allowed for this role.")
        return user

    return _dep


def resolve_student_id(
    user: Optional[User] = Depends(get_optional_user),
    x_student_id: Optional[str] = Header(default=None, alias="X-Student-Id"),
) -> str:
    if user and user.role == "student":
        return user.id
    if user and user.role in {"teacher", "branch_admin", "super_admin"} and x_student_id:
        return x_student_id.strip()
    if settings.AUTH_LEGACY_HEADERS:
        return ((x_student_id or "").strip() or settings.DEFAULT_STUDENT_ID)[:64]
    raise HTTPException(401, "Student authentication required.")


def resolve_teacher_id(
    user: Optional[User] = Depends(get_optional_user),
    x_teacher_id: Optional[str] = Header(default=None, alias="X-Teacher-Id"),
) -> str:
    if user and user.role == "teacher":
        return user.id
    if user and user.role in {"super_admin", "branch_admin"}:
        return ((x_teacher_id or user.id).strip())[:64]
    if settings.AUTH_LEGACY_HEADERS:
        return ((x_teacher_id or "").strip() or "teacher")[:64]
    raise HTTPException(401, "Teacher authentication required.")


def resolve_student_keys(
    user: Optional[User] = Depends(get_optional_user),
    x_student_id: Optional[str] = Header(default=None, alias="X-Student-Id"),
    x_student_aliases: Optional[str] = Header(default=None, alias="X-Student-Aliases"),
) -> list[str]:
    keys: list[str] = []
    if user and user.role == "student":
        keys.append(user.id)
        if user.username:
            keys.append(user.username)
        if user.email:
            keys.append(user.email)
    elif settings.AUTH_LEGACY_HEADERS:
        sid = ((x_student_id or "").strip() or settings.DEFAULT_STUDENT_ID)[:64]
        keys.append(sid)
    if x_student_aliases:
        keys.extend([p.strip() for p in x_student_aliases.split(",") if p.strip()])
    seen = set()
    out = []
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    if not out:
        raise HTTPException(401, "Student authentication required.")
    return out
