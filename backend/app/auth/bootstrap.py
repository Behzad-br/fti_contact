from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.security import hash_password
from app.config import settings

logger = logging.getLogger(__name__)


def ensure_bootstrap_admin(db: Session) -> None:
    """Create the first super admin from env when the user table is empty."""
    if db.query(User).count() > 0:
        return
    username = (settings.AUTH_BOOTSTRAP_USERNAME or "admin").strip().lower()
    password = (settings.AUTH_BOOTSTRAP_PASSWORD or "").strip()
    if len(password) < 8:
        logger.warning(
            "No users in DB and AUTH_BOOTSTRAP_PASSWORD is missing/short. "
            "Set AUTH_BOOTSTRAP_USERNAME and AUTH_BOOTSTRAP_PASSWORD (8+ chars) to create the first admin."
        )
        return
    email = (settings.AUTH_BOOTSTRAP_EMAIL or f"{username}@local").strip().lower()
    admin = User(
        role="super_admin",
        email=email,
        username=username,
        password_hash=hash_password(password),
        full_name=settings.AUTH_BOOTSTRAP_NAME or "Super Admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    logger.info("Bootstrap super_admin created: %s", username)
