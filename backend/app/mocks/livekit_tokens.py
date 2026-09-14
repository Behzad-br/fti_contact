"""LiveKit access tokens stay on the backend. Browser never receives the API secret."""
from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)


def livekit_configured() -> bool:
    return bool(
        (settings.LIVEKIT_URL or "").strip()
        and (settings.LIVEKIT_API_KEY or "").strip()
        and (settings.LIVEKIT_API_SECRET or "").strip()
    )


def room_name(assignment_id: str) -> str:
    return f"mock-{assignment_id}"


def student_identity(student_id: str) -> str:
    return f"student-{student_id}"


def teacher_identity(teacher_id: str) -> str:
    return f"teacher-{teacher_id}"


def create_token(*, identity: str, name: str, room: str, can_publish: bool, can_subscribe: bool) -> str:
    from livekit.api import AccessToken, VideoGrants

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=room,
                can_publish=can_publish,
                can_subscribe=can_subscribe,
                can_publish_data=False,
                can_update_own_metadata=True,
            )
        )
    )
    return token.to_jwt()
