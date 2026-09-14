from __future__ import annotations

from sqlalchemy.orm import Session

from app.mocks.models import MockLibraryItem


DEFAULT_LIBRARY = [
    {
        "id": "lib-academic-mock-05",
        "title": "IELTS Academic Mock 05",
        "mock_type": "full",
        "ielts_type": "academic",
        "question_count": 40,
        "duration_minutes": 160,
    },
    {
        "id": "lib-academic-reading",
        "title": "IELTS Academic Reading Mock",
        "mock_type": "reading",
        "ielts_type": "academic",
        "question_count": 40,
        "duration_minutes": 60,
    },
    {
        "id": "lib-academic-listening",
        "title": "IELTS Academic Listening Mock",
        "mock_type": "listening",
        "ielts_type": "academic",
        "question_count": 40,
        "duration_minutes": 40,
    },
    {
        "id": "lib-academic-writing",
        "title": "IELTS Academic Writing Mock",
        "mock_type": "writing",
        "ielts_type": "academic",
        "question_count": 2,
        "duration_minutes": 60,
    },
    {
        "id": "lib-academic-speaking",
        "title": "IELTS Academic Speaking Mock",
        "mock_type": "speaking",
        "ielts_type": "academic",
        "question_count": None,
        "duration_minutes": 15,
    },
    {
        "id": "lib-gt-reading",
        "title": "IELTS General Training Reading Mock",
        "mock_type": "reading",
        "ielts_type": "general_training",
        "question_count": 40,
        "duration_minutes": 60,
    },
]


def _paper_refs_for(mock_type: str, ielts_type: str, db: Session) -> dict:
    refs: dict = {}
    try:
        from app.reading.services import bank as reading_bank

        tests = [t for t in reading_bank.all_tests() if (t.get("test_type") or "academic") == ielts_type]
        if not tests:
            tests = reading_bank.all_tests()
        if tests:
            refs["reading_test_id"] = tests[0].get("id")
    except Exception:
        pass
    try:
        from app.listening.services import bank as listening_bank

        tests = listening_bank.all_tests()
        if tests:
            refs["listening_test_id"] = tests[0].get("id")
    except Exception:
        pass
    try:
        from app.writing.models import WritingQuestion

        q1 = (
            db.query(WritingQuestion)
            .filter_by(status="published", task_number=1, test_type=ielts_type)
            .first()
        )
        q2 = (
            db.query(WritingQuestion)
            .filter_by(status="published", task_number=2, test_type=ielts_type)
            .first()
        )
        if q1:
            refs["task1_id"] = q1.id
        if q2:
            refs["task2_id"] = q2.id
    except Exception:
        pass
    return refs


def ensure_library(db: Session) -> None:
    existing = {row.id for row in db.query(MockLibraryItem).all()}
    changed = False
    for item in DEFAULT_LIBRARY:
        if item["id"] in existing:
            continue
        row = MockLibraryItem(
            id=item["id"],
            title=item["title"],
            mock_type=item["mock_type"],
            ielts_type=item["ielts_type"],
            question_count=item.get("question_count"),
            duration_minutes=item.get("duration_minutes"),
            created_by="system",
        )
        row.paper_refs = _paper_refs_for(item["mock_type"], item["ielts_type"], db)
        db.add(row)
        changed = True
    if changed:
        db.commit()
