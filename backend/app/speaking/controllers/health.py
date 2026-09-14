"""Health controller."""
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.speaking.schemas import HealthSchema
from app.llm.client import minimax_client

router = APIRouter()


@router.get("/health", response_model=HealthSchema)
async def health():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return HealthSchema(
        status="ok",
        database=db_ok,
        minimax_configured=minimax_client.is_configured(),
        whisper_model=settings.WHISPER_MODEL,
        app_name=settings.APP_NAME,
    )
