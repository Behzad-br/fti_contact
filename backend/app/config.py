"""
config.py — Application settings loaded from environment variables.

Change APP_NAME to rebrand the entire application.
Change WHISPER_MODEL to: tiny, base, small, medium
Change MINIMAX_MODEL to any supported MiniMax model name.
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Project root: backend/app/ -> backend/ -> project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # ── Branding ──────────────────────────────────────────────────────────────
    APP_NAME: str = "IELTS Practice"

    # ── LLM Configuration (Generic) ───────────────────────────────────────────
    LLM_PROVIDER: str = "minimax"  # "minimax", "openai", "gemini", "anthropic"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = "MiniMax-Text-01"
    LLM_TEMPERATURE: float = 0.7
    LLM_TIMEOUT_SECONDS: int = 120
    LLM_MAX_RETRIES: int = 2

    # Provider-specific keys (mapped onto LLM_* in model_post_init)
    OPENAI_API_KEY: str = ""

    # Deprecated MiniMax settings (backward compatibility)
    MINIMAX_API_KEY: str = ""
    MINIMAX_BASE_URL: str = "https://api.minimax.chat/v1"
    MINIMAX_MODEL: str = "MiniMax-Text-01"

    def model_post_init(self, __context):
        """Normalize DB URL and map provider-specific keys onto generic LLM settings."""
        url = (self.DATABASE_URL or "").strip()
        if not url or url.lower() in {"sqlite", "local"}:
            self.DATABASE_URL = f"sqlite:///{_PROJECT_ROOT / 'data' / 'ielts_speaking.db'}"
        else:
            self.DATABASE_URL = url

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
            return

        if not self.LLM_API_KEY and self.MINIMAX_API_KEY:
            self.LLM_PROVIDER = "minimax"
            self.LLM_API_KEY = self.MINIMAX_API_KEY
            if not self.LLM_BASE_URL:
                self.LLM_BASE_URL = self.MINIMAX_BASE_URL
            if self.LLM_MODEL == "MiniMax-Text-01" and self.MINIMAX_MODEL:
                self.LLM_MODEL = self.MINIMAX_MODEL

    # ── Whisper (local) ───────────────────────────────────────────────────────
    # Supported: tiny, base, small, medium, large
    # Recommended for ordinary laptops: base (fast) or small (better accuracy)
    WHISPER_MODEL: str = "base"
    WHISPER_LANGUAGE: str = "en"

    # ── Database ──────────────────────────────────────────────────────────────
    # Empty / omitted → local SQLite. Set postgresql://… for Neon / other free cloud DB.
    DATABASE_URL: str = f"sqlite:///{_PROJECT_ROOT / 'data' / 'ielts_speaking.db'}"

    # ── Question bank ─────────────────────────────────────────────────────────
    QUESTION_BANK_PATH: str = str(_PROJECT_ROOT / "data" / "question_bank.json")
    WRITING_BANK_PATH: str = str(_PROJECT_ROOT / "data" / "ielts_writing_starter_bank_150.json")
    WRITING_IMAGE_DIR: str = str(_PROJECT_ROOT / "data" / "writing_images")
    WRITING_PACKS_DIR: str = str(_PROJECT_ROOT / "data" / "writing-packs")
    WRITING_ARCHIVE_PATH: str = str(_PROJECT_ROOT / "data" / "writing-packs" / "_archive.zip")
    WRITING_MODEL_ARCHIVE_PATH: str = str(_PROJECT_ROOT / "data" / "writing-packs" / "_model-answers.zip")
    READING_BANK_PATH: str = str(_PROJECT_ROOT / "data" / "reading-practice-bank-v3.json")
    READING_IMPORT_DIR: str = str(_PROJECT_ROOT / "data" / "imports" / "reading")
    RAW_IMPORT_DIR: str = str(_PROJECT_ROOT / "data" / "imports" / "raw")
    READING_DIAGRAM_DIR: str = str(_PROJECT_ROOT / "data" / "reading_diagrams")
    READING_PACKS_DIR: str = str(_PROJECT_ROOT / "data" / "reading-packs")
    READING_ARCHIVE_PATH: str = str(_PROJECT_ROOT / "data" / "reading-packs" / "_archive.zip")
    READING_KEY_ARCHIVE_PATH: str = str(_PROJECT_ROOT / "data" / "reading-packs" / "_answer-keys.zip")
    LISTENING_BANK_PATH: str = str(_PROJECT_ROOT / "data" / "listening-database.json")
    LISTENING_IMPORT_DIR: str = str(_PROJECT_ROOT / "data" / "imports" / "listening")
    LISTENING_PACKS_DIR: str = str(_PROJECT_ROOT / "data" / "listening-packs")
    LISTENING_ARCHIVE_PATH: str = str(_PROJECT_ROOT / "data" / "listening-packs" / "_archive.zip")
    LISTENING_ARCHIVE_ASSET_INDEX: str = str(_PROJECT_ROOT / "data" / "listening-packs" / "_archive-assets.json")
    LISTENING_ARCHIVE_CACHE_DIR: str = str(_PROJECT_ROOT / "data" / "tmp" / "listening-archive-assets")
    LISTENING_AUDIO_DIR: str = str(_PROJECT_ROOT / "data" / "listening_audio")
    LISTENING_MAP_DIR: str = str(_PROJECT_ROOT / "data" / "listening_maps")
    NOTES_DIR: str = str(_PROJECT_ROOT / "data" / "notes")

    # ── Writing AI (backend-only; never sent to the browser) ──────────────────
    OPENAI_WRITING_GRADING_MODEL: str = ""
    OPENAI_WRITING_GENERATION_MODEL: str = ""
    WRITING_AI_GRADING_ENABLED: bool = True
    WRITING_DUPLICATE_THRESHOLD: float = 0.94
    WRITING_ADMIN_TOKEN: str = ""
    DEFAULT_STUDENT_ID: str = "local"

    # Isolated mock exam + live monitoring add-on. Existing LMS stays up if this is false.
    ENABLE_LIVE_MOCK_MONITORING: bool = True
    LIVEKIT_URL: str = ""
    LIVEKIT_API_KEY: str = ""
    LIVEKIT_API_SECRET: str = ""

    # ── Upload limits ─────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 50
    TEMP_DIR: str = str(_PROJECT_ROOT / "data" / "tmp")

    # ── Auth (production JWT) ─────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production-use-long-random-string"
    JWT_EXPIRE_HOURS: int = 12
    AUTH_LEGACY_HEADERS: bool = False  # True only for local/tests that still send X-Student-Id
    AUTH_BOOTSTRAP_USERNAME: str = "admin"
    AUTH_BOOTSTRAP_PASSWORD: str = ""
    AUTH_BOOTSTRAP_EMAIL: str = "admin@local"
    AUTH_BOOTSTRAP_NAME: str = "Super Admin"
    CORS_ORIGINS: str = "http://127.0.0.1:5174,http://localhost:5174"

    # ── Security ──────────────────────────────────────────────────────────────
    ALLOWED_AUDIO_TYPES: list = ["audio/webm", "audio/webm;codecs=opus",
                                  "audio/ogg", "audio/ogg;codecs=opus",
                                  "audio/mp4", "audio/wav", "audio/mpeg",
                                  "audio/x-m4a", "application/octet-stream"]

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
