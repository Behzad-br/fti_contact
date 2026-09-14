"""Insert a locked sample PDF note so the teacher list is not empty."""
from __future__ import annotations

import logging
import os

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.notes.models import ClassNote
from app.notes.pdf import inspect_pdf, write_sample_pdf

logger = logging.getLogger(__name__)

SAMPLE_STORED_NAME = "sample-speaking-part1.pdf"
SAMPLE_TITLE = "Speaking Part 1 sample notes"
SAMPLE_DESCRIPTION = "Sample class notes. Locked until you unlock a batch or selected students."
SAMPLE_TXT_NAME = "sample-speaking-part1.txt"


def should_seed() -> bool:
    return "PYTEST_CURRENT_TEST" not in os.environ


def ensure_sample_note(db: Session) -> None:
    if not should_seed():
        return
    dest = Path(settings.NOTES_DIR)
    dest.mkdir(parents=True, exist_ok=True)
    pdf_path = dest / SAMPLE_STORED_NAME
    existing = (
        db.query(ClassNote)
        .filter(ClassNote.stored_name.in_([SAMPLE_STORED_NAME, SAMPLE_TXT_NAME]))
        .first()
    )
    stored_name = SAMPLE_STORED_NAME
    original_name = "speaking-part-1-sample.pdf"
    pages = 1
    try:
        pages = write_sample_pdf(pdf_path)
        pages = inspect_pdf(pdf_path) or pages
    except Exception as exc:
        logger.warning("Could not write sample PDF notes (%s); seeding a text file instead.", exc)
        stored_name = SAMPLE_TXT_NAME
        original_name = "speaking-part-1-sample.txt"
        txt_path = dest / SAMPLE_TXT_NAME
        txt_path.write_text(
            "FTI IELTS - Speaking Part 1 sample notes\n\n"
            "Hometown\n"
            "- Where do you live, and how long have you lived there?\n"
            "- What do you like most about your area?\n\n"
            "This sample stays locked until the teacher unlocks a batch or student.\n",
            encoding="utf-8",
        )
        pages = 1
        existing = db.query(ClassNote).filter(ClassNote.stored_name == SAMPLE_TXT_NAME).first() or existing
    if existing:
        existing.page_count = pages
        existing.title = existing.title or SAMPLE_TITLE
        db.commit()
        return
    note = ClassNote(
        title=SAMPLE_TITLE,
        description=SAMPLE_DESCRIPTION,
        original_name=original_name,
        stored_name=stored_name,
        page_count=pages,
        created_by="system",
    )
    note.unlocked_batches = []
    note.unlocked_student_ids = []
    db.add(note)
    db.commit()
    logger.info("Seeded locked sample notes: %s", SAMPLE_TITLE)
