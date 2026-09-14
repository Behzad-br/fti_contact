"""
tests/conftest.py — Pytest fixtures for backend tests.

MiniMax API calls are mocked — tests do NOT require API keys or internet access.
"""
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from unittest.mock import AsyncMock, patch

# Import models FIRST so Base knows about all tables
from app.speaking import models as _models  # noqa: F401
from app.writing import models as _writing_models  # noqa: F401
from app.reading import models as _reading_models  # noqa: F401
from app.listening import models as _listening_models  # noqa: F401
from app.homework import models as _homework_models  # noqa: F401
from app.notes import models as _notes_models  # noqa: F401
from app.mocks import models as _mocks_models  # noqa: F401
from app.auth import models as _auth_models  # noqa: F401
from app.database import Base, get_db
from app.main import app
from app.config import settings

# Tests still use X-Student-Id / X-Teacher-Id headers.
settings.AUTH_LEGACY_HEADERS = True
settings.AUTH_BOOTSTRAP_PASSWORD = ""  # avoid auto-admin side effects in tests

# In-memory SQLite with shared cache so all connections see the same data
_TEST_DB_URL = "sqlite:///file:testdb_ielts?mode=memory&cache=shared&uri=true"
_engine = create_engine(
    _TEST_DB_URL,
    connect_args={"check_same_thread": False},
)
_TestSessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

# Create tables IMMEDIATELY on module load
Base.metadata.create_all(bind=_engine)


def _override_get_db():
    """FastAPI dependency override that uses the test engine."""
    db = _TestSessionFactory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def ensure_tables():
    """Session-scoped: make sure tables exist (they were created at import time)."""
    Base.metadata.create_all(bind=_engine)
    yield


@pytest.fixture
def db():
    """Per-test DB session."""
    session = _TestSessionFactory()
    yield session
    session.close()


@pytest.fixture
def client():
    """FastAPI TestClient with test DB injected."""
    from unittest.mock import patch
    from app import database as db_module

    # Patch the production engine/session so the lifespan uses our test DB
    original_engine = db_module.engine
    original_session = db_module.SessionLocal

    db_module.engine = _engine
    db_module.SessionLocal = _TestSessionFactory

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()

    db_module.engine = original_engine
    db_module.SessionLocal = original_session



# ─── Mock MiniMax responses ───────────────────────────────────────────────────

MOCK_FRESH_TEST = {
    "id": "fresh-test123",
    "title": "IELTS Speaking Practice — Describe a skill",
    "part1": [
        "Do you work or study?",
        "What hobbies do you have?",
        "Do you enjoy cooking?",
        "How do you spend weekends?",
        "Have you tried learning a new skill recently?",
    ],
    "part2": {
        "topic": "Describe a skill you would like to learn.",
        "bullets": ["what it is", "why you want to learn it", "how you would learn it", "why it would be useful"],
    },
    "part3": [
        "Why do people find it hard to learn new skills?",
        "How has technology changed learning?",
        "Is formal or self-directed learning better?",
        "What skills will matter most in the future?",
        "Should governments fund skill development programmes?",
    ],
}

MOCK_EVALUATION = {
    "fluency_coherence": 6.5,
    "lexical_resource": 6.0,
    "grammar": 6.5,
    "pronunciation": "Not assessed in this version",
    "estimated_band": 6.5,
    "strengths": ["Good topic development", "Relevant examples given"],
    "weaknesses": ["Frequent use of filler 'like'", "Limited complex sentences"],
    "corrections": [
        {"original": "I have went", "better": "I went"},
    ],
    "part1_feedback": "Answers were relevant but could be extended.",
    "part2_feedback": "Good personal narrative with clear structure.",
    "part3_feedback": "Showed some analytical thinking.",
    "improvement_tips": "Focus on reducing fillers and using more complex grammar.",
    "detailed_feedback": "Overall B2-level performance.",
}
