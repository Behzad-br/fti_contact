"""Writing LLM wrappers with usage logging. API keys stay on the server."""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.writing.models import WritingAiUsage
from app.llm.client import MinimaxError, minimax_client

logger = logging.getLogger(__name__)


def grading_model() -> str:
    return (
        settings.OPENAI_WRITING_GRADING_MODEL
        or settings.LLM_MODEL
        or "gpt-4o-mini"
    )


def generation_model() -> str:
    return (
        settings.OPENAI_WRITING_GENERATION_MODEL
        or settings.LLM_MODEL
        or "gpt-4o-mini"
    )


def log_usage(
    db: Optional[Session],
    request_type: str,
    *,
    success: bool,
    model: Optional[str] = None,
    student_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    if db is None:
        return
    db.add(
        WritingAiUsage(
            request_type=request_type,
            model=model,
            student_id=student_id,
            success=success,
            error_message=(error or "")[:500] or None,
        )
    )
    try:
        db.flush()
    except Exception:
        logger.exception("Failed to record writing AI usage")


async def writing_chat_json(
    system_prompt: str,
    user_prompt: str,
    *,
    model: Optional[str] = None,
    db: Optional[Session] = None,
    request_type: str = "writing",
    student_id: Optional[str] = None,
    max_tokens: int = 4096,
) -> dict:
    used_model = model or grading_model()
    try:
        data = await minimax_client.chat_json(
            system_prompt,
            user_prompt,
            retries=2,
            model=used_model,
            max_tokens=max_tokens,
        )
        log_usage(db, request_type, success=True, model=used_model, student_id=student_id)
        return data
    except MinimaxError as exc:
        log_usage(
            db,
            request_type,
            success=False,
            model=used_model,
            student_id=student_id,
            error=str(exc),
        )
        raise
