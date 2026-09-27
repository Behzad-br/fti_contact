"""
config.py — Application settings loaded from environment variables.
"""
from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# backend/app/config.py → backend/ (or itles-backend/ when deployed alone)
_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _resolve_project_root() -> Path:
    """
    Monorepo: <repo>/backend/app/... → project root = <repo>
    Self-contained VPS deploy: /apps/itles-backend/app/... → root = itles-backend
    """
    parent = _BACKEND_DIR.parent
    if _BACKEND_DIR.name == "backend" and (
        (parent / "frontend").is_dir()
        or (parent / "data" / "question_bank.json").is_file()
        or (parent / ".env.example").is_file()
    ):
        return parent
    return _BACKEND_DIR


_PROJECT_ROOT = _resolve_project_root()
_logger = logging.getLogger(__name__)

_PROD_CORS = "https://fti4iltes.tech,https://www.fti4iltes.tech"
_DEV_CORS = "http://127.0.0.1:5174,http://localhost:5174"


def _env_file_paths() -> tuple[str, ...]:
    """Prefer backend/.env on VPS; also load monorepo root .env when present."""
    paths: list[str] = []
    for candidate in (_BACKEND_DIR / ".env", _PROJECT_ROOT / ".env"):
        if candidate.is_file() and str(candidate) not in paths:
            paths.append(str(candidate))
    if not paths:
        paths.append(str(_BACKEND_DIR / ".env"))
    return tuple(paths)


class Settings(BaseSettings):
    # ── Runtime ───────────────────────────────────────────────────────────────
    NODE_ENV: str = "development"
    ENV: str = ""
    PORT: int = 5000
    APP_NAME: str = "IELTS Practice"

    # Persistent data root (uploads, banks, notes). Override on VPS if needed.
    DATA_DIR: str = ""

    # ── LLM Configuration (Generic) ───────────────────────────────────────────
    LLM_PROVIDER: str = "minimax"  # "minimax", "openai", "gemini", "anthropic"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = "MiniMax-Text-01"
    LLM_TEMPERATURE: float = 0.7
    LLM_TIMEOUT_SECONDS: int = 120
    LLM_MAX_RETRIES: int = 2

    OPENAI_API_KEY: str = ""

    # Deprecated MiniMax settings (backward compatibility)
    MINIMAX_API_KEY: str = ""
    MINIMAX_BASE_URL: str = "https://api.minimax.chat/v1"
    MINIMAX_MODEL: str = "MiniMax-Text-01"

    # ── Whisper (local) ───────────────────────────────────────────────────────
    WHISPER_MODEL: str = "base"
    WHISPER_LANGUAGE: str = "en"

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = ""
    DB_HOST: str = ""
    DB_PORT: int = 3306
    DB_NAME: str = ""
    DB_USER: str = ""
    DB_PASSWORD: str = ""

    # ── Paths (resolved in model_post_init from DATA_DIR / PROJECT_ROOT) ───────
    QUESTION_BANK_PATH: str = ""
    WRITING_BANK_PATH: str = ""
    WRITING_IMAGE_DIR: str = ""
    WRITING_PACKS_DIR: str = ""
    WRITING_ARCHIVE_PATH: str = ""
    WRITING_MODEL_ARCHIVE_PATH: str = ""
    READING_BANK_PATH: str = ""
    READING_IMPORT_DIR: str = ""
    RAW_IMPORT_DIR: str = ""
    READING_DIAGRAM_DIR: str = ""
    READING_PACKS_DIR: str = ""
    READING_ARCHIVE_PATH: str = ""
    READING_KEY_ARCHIVE_PATH: str = ""
    LISTENING_BANK_PATH: str = ""
    LISTENING_IMPORT_DIR: str = ""
    LISTENING_PACKS_DIR: str = ""
    LISTENING_ARCHIVE_PATH: str = ""
    LISTENING_ARCHIVE_ASSET_INDEX: str = ""
    LISTENING_ARCHIVE_CACHE_DIR: str = ""
    LISTENING_AUDIO_DIR: str = ""
    LISTENING_MAP_DIR: str = ""
    NOTES_DIR: str = ""
    MOCK_IMAGE_DIR: str = ""
    HOMEWORK_AUDIO_DIR: str = ""
    TEMP_DIR: str = ""

    # ── Writing AI (backend-only; never sent to the browser) ──────────────────
    OPENAI_WRITING_GRADING_MODEL: str = ""
    OPENAI_WRITING_GENERATION_MODEL: str = ""
    WRITING_AI_GRADING_ENABLED: bool = True
    WRITING_DUPLICATE_THRESHOLD: float = 0.94
    WRITING_ADMIN_TOKEN: str = ""
    DEFAULT_STUDENT_ID: str = "local"

    ENABLE_LIVE_MOCK_MONITORING: bool = True
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    MAX_UPLOAD_SIZE_MB: int = 50

    # ── Auth ──────────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production-use-long-random-string"
    JWT_EXPIRE_HOURS: int = 12
    AUTH_LEGACY_HEADERS: bool = False
    AUTH_BOOTSTRAP_USERNAME: str = "admin"
    AUTH_BOOTSTRAP_PASSWORD: str = ""
    AUTH_BOOTSTRAP_EMAIL: str = "admin@local"
    AUTH_BOOTSTRAP_NAME: str = "Super Admin"
    CORS_ORIGINS: str = ""
    FRONTEND_URL: str = "https://fti4iltes.tech"

    ALLOWED_AUDIO_TYPES: list = [
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/ogg",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/wav",
        "audio/mpeg",
        "audio/x-m4a",
        "application/octet-stream",
    ]

    model_config = SettingsConfigDict(
        env_file=_env_file_paths(),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def PROJECT_ROOT(self) -> Path:
        return _PROJECT_ROOT

    @property
    def BACKEND_DIR(self) -> Path:
        return _BACKEND_DIR

    @property
    def is_production(self) -> bool:
        env = (self.ENV or self.NODE_ENV or "").strip().lower()
        return env in {"production", "prod"}

    def resolved_database_url(self) -> str:
        """Full SQLAlchemy URL: explicit DATABASE_URL, else MySQL from DB_*, else SQLite."""
        explicit = (self.DATABASE_URL or "").strip()
        if explicit and explicit.lower() not in {"sqlite", "local", "mysql", "mariadb"}:
            return explicit

        host = (self.DB_HOST or "").strip()
        name = (self.DB_NAME or "").strip()
        user = (self.DB_USER or "").strip()
        if host and name and user:
            password = quote_plus(self.DB_PASSWORD or "")
            port = int(self.DB_PORT or 3306)
            return (
                f"mysql+pymysql://{quote_plus(user)}:{password}"
                f"@{host}:{port}/{name}?charset=utf8mb4"
            )

        return f"sqlite:///{_PROJECT_ROOT / 'data' / 'ielts_speaking.db'}"

    def cors_origin_list(self) -> list[str]:
        raw = (self.CORS_ORIGINS or "").strip()
        if raw:
            return [o.strip() for o in raw.split(",") if o.strip()]
        if self.is_production:
            origins = [o.strip() for o in _PROD_CORS.split(",") if o.strip()]
            front = (self.FRONTEND_URL or "").strip().rstrip("/")
            if front and front not in origins:
                origins.append(front)
            return origins
        return [o.strip() for o in _DEV_CORS.split(",") if o.strip()]

    @model_validator(mode="after")
    def _finalize(self):
        self.DATABASE_URL = self.resolved_database_url()

        data_root = Path(self.DATA_DIR).resolve() if (self.DATA_DIR or "").strip() else (_PROJECT_ROOT / "data")
        data_root.mkdir(parents=True, exist_ok=True)

        def p(*parts: str) -> str:
            return str(data_root.joinpath(*parts))

        if not self.QUESTION_BANK_PATH:
            self.QUESTION_BANK_PATH = p("question_bank.json")
        if not self.WRITING_BANK_PATH:
            self.WRITING_BANK_PATH = p("ielts_writing_starter_bank_150.json")
        if not self.WRITING_IMAGE_DIR:
            self.WRITING_IMAGE_DIR = p("writing_images")
        if not self.WRITING_PACKS_DIR:
            self.WRITING_PACKS_DIR = p("writing-packs")
        if not self.WRITING_ARCHIVE_PATH:
            self.WRITING_ARCHIVE_PATH = p("writing-packs", "_archive.zip")
        if not self.WRITING_MODEL_ARCHIVE_PATH:
            self.WRITING_MODEL_ARCHIVE_PATH = p("writing-packs", "_model-answers.zip")
        if not self.READING_BANK_PATH:
            self.READING_BANK_PATH = p("reading-practice-bank-v3.json")
        if not self.READING_IMPORT_DIR:
            self.READING_IMPORT_DIR = p("imports", "reading")
        if not self.RAW_IMPORT_DIR:
            self.RAW_IMPORT_DIR = p("imports", "raw")
        if not self.READING_DIAGRAM_DIR:
            self.READING_DIAGRAM_DIR = p("reading_diagrams")
        if not self.READING_PACKS_DIR:
            self.READING_PACKS_DIR = p("reading-packs")
        if not self.READING_ARCHIVE_PATH:
            self.READING_ARCHIVE_PATH = p("reading-packs", "_archive.zip")
        if not self.READING_KEY_ARCHIVE_PATH:
            self.READING_KEY_ARCHIVE_PATH = p("reading-packs", "_answer-keys.zip")
        if not self.LISTENING_BANK_PATH:
            self.LISTENING_BANK_PATH = p("listening-database.json")
        if not self.LISTENING_IMPORT_DIR:
            self.LISTENING_IMPORT_DIR = p("imports", "listening")
        if not self.LISTENING_PACKS_DIR:
            self.LISTENING_PACKS_DIR = p("listening-packs")
        if not self.LISTENING_ARCHIVE_PATH:
            self.LISTENING_ARCHIVE_PATH = p("listening-packs", "_archive.zip")
        if not self.LISTENING_ARCHIVE_ASSET_INDEX:
            self.LISTENING_ARCHIVE_ASSET_INDEX = p("listening-packs", "_archive-assets.json")
        if not self.LISTENING_ARCHIVE_CACHE_DIR:
            self.LISTENING_ARCHIVE_CACHE_DIR = p("tmp", "listening-archive-assets")
        if not self.LISTENING_AUDIO_DIR:
            self.LISTENING_AUDIO_DIR = p("listening_audio")
        if not self.LISTENING_MAP_DIR:
            self.LISTENING_MAP_DIR = p("listening_maps")
        if not self.NOTES_DIR:
            self.NOTES_DIR = p("notes")
        if not self.MOCK_IMAGE_DIR:
            self.MOCK_IMAGE_DIR = p("mock_images")
        if not self.HOMEWORK_AUDIO_DIR:
            self.HOMEWORK_AUDIO_DIR = p("homework_audio")
        if not self.TEMP_DIR:
            self.TEMP_DIR = p("tmp")

        provider = (self.LLM_PROVIDER or "").strip().lower()
        wants_openai = provider == "openai" or bool(self.OPENAI_API_KEY.strip())

        if wants_openai:
            self.LLM_PROVIDER = "openai"
            if not self.LLM_API_KEY.strip():
                self.LLM_API_KEY = self.OPENAI_API_KEY.strip()
            if not self.LLM_BASE_URL.strip():
                self.LLM_BASE_URL = "https://api.openai.com/v1"
            model = (self.LLM_MODEL or "").strip()
            if not model or model.lower().startswith("minimax"):
                self.LLM_MODEL = "gpt-4o-mini"
        elif not self.LLM_API_KEY and self.MINIMAX_API_KEY:
            self.LLM_PROVIDER = "minimax"
            self.LLM_API_KEY = self.MINIMAX_API_KEY
            if not self.LLM_BASE_URL:
                self.LLM_BASE_URL = self.MINIMAX_BASE_URL
            if self.LLM_MODEL == "MiniMax-Text-01" and self.MINIMAX_MODEL:
                self.LLM_MODEL = self.MINIMAX_MODEL

        if self.is_production and self.JWT_SECRET.startswith("change-me"):
            _logger.warning(
                "JWT_SECRET is still the default placeholder — set a long random value in production .env"
            )

        return self


settings = Settings()
