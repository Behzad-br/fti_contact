"""
main.py — FastAPI application entry point.

Production (Hestia / PM2):
    cd backend
    uvicorn app.main:asgi_app --host 127.0.0.1 --port ${PORT:-5000}

Local:
    uvicorn app.main:asgi_app --reload --host 127.0.0.1 --port 8001
"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.config import settings
from app.speaking.controllers import answers, health, history, tests
from app.writing.controllers import writing, writing_admin
from app.reading.controllers import reading
from app.listening.controllers import listening
from app.homework import controllers as homework
from app.notes import controllers as notes
from app.mocks import controllers as mocks
from app.auth import controllers as auth
from app.database import init_db
from app.security_hardening import SecurityHeadersMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _assert_production_security() -> None:
    if not settings.is_production:
        return
    if (settings.JWT_SECRET or "").startswith("change-me"):
        raise RuntimeError(
            "Refusing to start: set a strong JWT_SECRET in production .env (not the default placeholder)."
        )
    if settings.AUTH_LEGACY_HEADERS:
        raise RuntimeError(
            "Refusing to start: AUTH_LEGACY_HEADERS must be false in production."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    logger.info("Starting %s...", settings.APP_NAME)
    _assert_production_security()

    # Ensure data directories exist
    for d in (
        settings.TEMP_DIR,
        settings.WRITING_IMAGE_DIR,
        settings.WRITING_PACKS_DIR,
        settings.READING_DIAGRAM_DIR,
        settings.READING_PACKS_DIR,
        settings.LISTENING_AUDIO_DIR,
        settings.LISTENING_MAP_DIR,
        settings.NOTES_DIR,
        settings.MOCK_IMAGE_DIR,
        settings.HOMEWORK_AUDIO_DIR,
    ):
        Path(d).mkdir(parents=True, exist_ok=True)
    Path(settings.QUESTION_BANK_PATH).parent.mkdir(parents=True, exist_ok=True)

    # Initialize database tables
    init_db()
    logger.info("Database initialized.")
    try:
        from app.database import SessionLocal
        from app.auth.bootstrap import ensure_bootstrap_admin
        from app.notes.seed import ensure_sample_note
        from app.mocks.seed import ensure_library

        db = SessionLocal()
        try:
            ensure_bootstrap_admin(db)
            # Content library only — no fake students/teachers.
            ensure_library(db)
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Could not bootstrap auth or mock library: %s", exc)

    try:
        from app.reading.services import bank as reading_bank
        from app.listening.services import bank as listening_bank
        reading_bank.load_bank()
        listening_bank.load_bank()
    except Exception as exc:
        logger.warning("Could not pre-load practice banks: %s", exc)

    # Load Whisper in the background so the API is usable immediately.
    def _load_whisper():
        try:
            from app.speaking.services.transcription import get_whisper_model
            get_whisper_model()
        except Exception as exc:
            logger.warning("Could not pre-load Whisper model: %s", exc)

    import threading
    threading.Thread(target=_load_whisper, daemon=True).start()

    yield

    # Shutdown — clean up any leftover temp files
    tmp_dir = Path(settings.TEMP_DIR)
    if tmp_dir.exists():
        for f in tmp_dir.glob("*"):
            try:
                f.unlink()
            except Exception:
                pass
    logger.info("%s shutting down.", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    description="Personal IELTS Speaking, Writing, Reading and Listening practice.",
    version="1.0.0",
    lifespan=lifespan,
    openapi_url=None if settings.is_production else "/api/openapi.json",
    docs_url=None if settings.is_production else "/api/docs",
    redoc_url=None,
)

# Trust X-Forwarded-* from Nginx on the same host (Hestia reverse proxy).
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1", "localhost", "::1"])
app.add_middleware(SecurityHeadersMiddleware)

# CORS — never "*" when credentials are used. Production defaults to fti4iltes.tech.
_cors = settings.cors_origin_list()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────── Exception handlers ───────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Keep real HTTP error details (404/400/500 from routes) instead of hiding them."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all: log fully; never send stack traces (or exception text in production)."""
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    detail = "An internal error occurred."
    if not settings.is_production:
        detail = f"An internal error occurred: {exc}"
    return JSONResponse(status_code=500, content={"detail": detail})


# ─────────────────────────── Routers ─────────────────────────────────────────

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(auth.org_router, prefix="/api", tags=["org"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(tests.router, prefix="/api", tags=["tests"])
app.include_router(answers.router, prefix="/api", tags=["answers"])
app.include_router(history.router, prefix="/api", tags=["history"])
app.include_router(writing.router, prefix="/api", tags=["writing"])
app.include_router(writing_admin.router, prefix="/api", tags=["writing-admin"])
app.include_router(reading.router, prefix="/api", tags=["reading"])
app.include_router(listening.router, prefix="/api", tags=["listening"])
app.include_router(homework.router, prefix="/api", tags=["homework"])
app.include_router(notes.router, prefix="/api", tags=["notes"])
app.include_router(mocks.router, prefix="/api", tags=["mocks"])


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "docs": "/api/docs",
        "health": "/api/health",
    }


try:
    from app.mocks.realtime import attach_socketio

    asgi_app = attach_socketio(app)
except Exception as exc:
    logger.warning("Socket.IO not attached; mock telemetry will use HTTP only: %s", exc)
    asgi_app = app
