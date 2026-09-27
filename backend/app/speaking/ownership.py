"""Shared speaking ownership checks."""
from __future__ import annotations

from fastapi import HTTPException

from app.config import settings
from app.speaking.models import TestSession


def assert_session_owner(session: TestSession, student_id: str) -> None:
    owner = (session.student_id or "").strip()
    if not owner:
        # Legacy rows created before ownership tracking.
        if settings.AUTH_LEGACY_HEADERS:
            return
        raise HTTPException(status_code=403, detail="Session is not accessible.")
    if owner != student_id:
        raise HTTPException(status_code=403, detail="You cannot access another student's session.")
