"""
database.py — SQLAlchemy engine + session factory + table creation.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

from app.config import settings

# Ensure data directory exists
Path(settings.DATABASE_URL.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + FastAPI
    echo=False,
)

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
    """Create all tables and apply lightweight SQLite column migrations."""
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

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if "test_sessions" in tables:
        columns = {col["name"] for col in inspector.get_columns("test_sessions")}
        if "practice_part" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE test_sessions ADD COLUMN practice_part INTEGER"))
    if "reading_attempts" in tables:
        reading_cols = {col["name"] for col in inspector.get_columns("reading_attempts")}
        if "snapshot_json" not in reading_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE reading_attempts ADD COLUMN snapshot_json TEXT"))
    if "writing_questions" in tables:
        writing_cols = {col["name"] for col in inspector.get_columns("writing_questions")}
        writing_alters = {
            "book_id": "ALTER TABLE writing_questions ADD COLUMN book_id VARCHAR",
            "book_title": "ALTER TABLE writing_questions ADD COLUMN book_title VARCHAR",
            "test_number": "ALTER TABLE writing_questions ADD COLUMN test_number INTEGER",
            "pack_test_id": "ALTER TABLE writing_questions ADD COLUMN pack_test_id VARCHAR",
        }
        with engine.begin() as conn:
            for name, sql in writing_alters.items():
                if name not in writing_cols:
                    conn.execute(text(sql))
    if "mock_attempts" in tables:
        mock_cols = {col["name"] for col in inspector.get_columns("mock_attempts")}
        mock_alters = {
            "screen_share_active": "ALTER TABLE mock_attempts ADD COLUMN screen_share_active BOOLEAN DEFAULT 0",
            "last_warning": "ALTER TABLE mock_attempts ADD COLUMN last_warning VARCHAR",
            "connection_status": "ALTER TABLE mock_attempts ADD COLUMN connection_status VARCHAR",
        }
        with engine.begin() as conn:
            for name, sql in mock_alters.items():
                if name not in mock_cols:
                    conn.execute(text(sql))
    if "mock_assignments" in tables:
        assign_cols = {col["name"] for col in inspector.get_columns("mock_assignments")}
        assign_alters = {
            "paper_source": "ALTER TABLE mock_assignments ADD COLUMN paper_source VARCHAR DEFAULT 'bank'",
            "result_mode": "ALTER TABLE mock_assignments ADD COLUMN result_mode VARCHAR DEFAULT 'teacher'",
        }
        with engine.begin() as conn:
            for name, sql in assign_alters.items():
                if name not in assign_cols:
                    conn.execute(text(sql))
