"""Health controller."""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.speaking.schemas import HealthSchema
from app.llm.client import minimax_client

router = APIRouter()


@router.get("/health", response_model=HealthSchema)
async def health():
    """Process alive + DB connectivity. Returns 503 when the database is unreachable."""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    body = HealthSchema(
        status="ok" if db_ok else "degraded",
        database=db_ok,
        minimax_configured=minimax_client.is_configured(),
        whisper_model=settings.WHISPER_MODEL,
        app_name=settings.APP_NAME,
    )
    if not db_ok:
        return JSONResponse(status_code=503, content=body.model_dump())
    return body
