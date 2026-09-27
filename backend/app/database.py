"""
database.py — SQLAlchemy engine + session factory + table creation.

Supports:
- SQLite (local/dev)
- MySQL / MariaDB (Hestia production)
- PostgreSQL (optional legacy)
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import String, create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.schema import Column

from app.config import settings

Base = declarative_base()


@event.listens_for(Column, "after_parent_attach")
def _mysql_default_string_length(column: Column, _table) -> None:
    """MySQL requires VARCHAR length; keep models portable by defaulting bare String → 255."""
    col_type = column.type
    if isinstance(col_type, String) and col_type.length is None:
        col_type.length = 255


_DATABASE_URL = settings.DATABASE_URL
_IS_SQLITE = _DATABASE_URL.startswith("sqlite:")
_IS_MYSQL = _DATABASE_URL.startswith("mysql:")


def _build_engine():
    if _IS_SQLITE:
        raw = _DATABASE_URL.replace("sqlite:///", "", 1)
        if raw and not raw.startswith(":memory:"):
            Path(raw).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(
            _DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    return create_engine(
        _DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=280,
        pool_size=5,
        max_overflow=10,
        echo=False,
    )


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency — yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and apply lightweight additive column migrations."""
    from app.speaking import models as _  # noqa: F401
    from app.writing import models as _writing  # noqa: F401
    from app.reading import models as _reading  # noqa: F401
    from app.listening import models as _listening  # noqa: F401
    from app.homework import models as _homework  # noqa: F401
    from app.notes import models as _notes  # noqa: F401
    from app.mocks import models as _mocks  # noqa: F401
    from app.auth import models as _auth  # noqa: F401
    from sqlalchemy import inspect

    Base.metadata.create_all(bind=engine)

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
    _add_column("test_sessions", "student_id", "ALTER TABLE test_sessions ADD COLUMN student_id VARCHAR(255)")
    _add_column("reading_attempts", "snapshot_json", "ALTER TABLE reading_attempts ADD COLUMN snapshot_json TEXT")
    _add_column("writing_questions", "book_id", "ALTER TABLE writing_questions ADD COLUMN book_id VARCHAR(255)")
    _add_column("writing_questions", "book_title", "ALTER TABLE writing_questions ADD COLUMN book_title VARCHAR(255)")
    _add_column("writing_questions", "test_number", "ALTER TABLE writing_questions ADD COLUMN test_number INTEGER")
    _add_column("writing_questions", "pack_test_id", "ALTER TABLE writing_questions ADD COLUMN pack_test_id VARCHAR(255)")

    if _IS_SQLITE:
        bool_ddl = "ALTER TABLE mock_attempts ADD COLUMN screen_share_active BOOLEAN DEFAULT 0"
    elif _IS_MYSQL:
        bool_ddl = "ALTER TABLE mock_attempts ADD COLUMN screen_share_active TINYINT(1) DEFAULT 0"
    else:
        bool_ddl = "ALTER TABLE mock_attempts ADD COLUMN screen_share_active BOOLEAN DEFAULT FALSE"
    _add_column("mock_attempts", "screen_share_active", bool_ddl)
    _add_column("mock_attempts", "last_warning", "ALTER TABLE mock_attempts ADD COLUMN last_warning VARCHAR(255)")
    _add_column(
        "mock_attempts",
        "connection_status",
        "ALTER TABLE mock_attempts ADD COLUMN connection_status VARCHAR(255)",
    )
    _add_column(
        "mock_assignments",
        "paper_source",
        "ALTER TABLE mock_assignments ADD COLUMN paper_source VARCHAR(64) DEFAULT 'bank'",
    )
    _add_column(
        "mock_assignments",
        "result_mode",
        "ALTER TABLE mock_assignments ADD COLUMN result_mode VARCHAR(64) DEFAULT 'teacher'",
    )


def check_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
