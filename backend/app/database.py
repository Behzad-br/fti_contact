"""
database.py — SQLAlchemy engine + session factory + table creation.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

from app.config import settings

_DATABASE_URL = (settings.DATABASE_URL or "").strip()
_IS_SQLITE = _DATABASE_URL.startswith("sqlite:")


def _build_engine():
    if _IS_SQLITE:
        # Ensure local data directory exists for file-backed SQLite.
        raw = _DATABASE_URL.replace("sqlite:///", "", 1)
        if raw and not raw.startswith(":memory:"):
            Path(raw).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(
            _DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    # Postgres / other remote engines (Neon, Supabase, Railway, …)
    return create_engine(
        _DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        echo=False,
    )


engine = _build_engine()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and apply lightweight column migrations (SQLite/Postgres)."""
    from sqlalchemy import inspect, text

    from app.speaking import models as _  # noqa: F401
    from app.writing import models as _writing  # noqa: F401
    from app.reading import models as _reading  # noqa: F401
    from app.listening import models as _listening  # noqa: F401
    from app.homework import models as _homework  # noqa: F401
    from app.notes import models as _notes  # noqa: F401
    from app.mocks import models as _mocks  # noqa: F401
    from app.auth import models as _auth  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Additive column migrations — SQLAlchemy create_all won't alter existing tables.
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    def _add_column(table: str, column: str, ddl: str):
        if table not in tables:
            return
        cols = {col["name"] for col in inspector.get_columns(table)}
        if column in cols:
            return
        with engine.begin() as conn:
            conn.execute(text(ddl))

    _add_column("test_sessions", "practice_part", "ALTER TABLE test_sessions ADD COLUMN practice_part INTEGER")
    _add_column("reading_attempts", "snapshot_json", "ALTER TABLE reading_attempts ADD COLUMN snapshot_json TEXT")
    _add_column("writing_questions", "book_id", "ALTER TABLE writing_questions ADD COLUMN book_id VARCHAR")
    _add_column("writing_questions", "book_title", "ALTER TABLE writing_questions ADD COLUMN book_title VARCHAR")
    _add_column("writing_questions", "test_number", "ALTER TABLE writing_questions ADD COLUMN test_number INTEGER")
    _add_column("writing_questions", "pack_test_id", "ALTER TABLE writing_questions ADD COLUMN pack_test_id VARCHAR")
    if _IS_SQLITE:
        _add_column(
            "mock_attempts",
            "screen_share_active",
            "ALTER TABLE mock_attempts ADD COLUMN screen_share_active BOOLEAN DEFAULT 0",
        )
    else:
        _add_column(
            "mock_attempts",
            "screen_share_active",
            "ALTER TABLE mock_attempts ADD COLUMN screen_share_active BOOLEAN DEFAULT FALSE",
        )
    _add_column("mock_attempts", "last_warning", "ALTER TABLE mock_attempts ADD COLUMN last_warning VARCHAR")
    _add_column("mock_attempts", "connection_status", "ALTER TABLE mock_attempts ADD COLUMN connection_status VARCHAR")
    _add_column(
        "mock_assignments",
        "paper_source",
        "ALTER TABLE mock_assignments ADD COLUMN paper_source VARCHAR DEFAULT 'bank'",
    )
    _add_column(
        "mock_assignments",
        "result_mode",
        "ALTER TABLE mock_assignments ADD COLUMN result_mode VARCHAR DEFAULT 'teacher'",
    )
