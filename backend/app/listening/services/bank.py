"""Load the original listening practice pack from JSON."""
from __future__ import annotations

import json
import logging
from copy import deepcopy
from pathlib import Path
from typing import Optional

from app.book_meta import book_fields, books_from_tests
from app.config import settings
from app.content_imports import merge_listening_imports
from app.saved_page_ingest import ingest_raw_folder

logger = logging.getLogger(__name__)

_bank: Optional[dict] = None
_tests_by_id: dict[str, dict] = {}
_catalog: Optional[dict] = None


def _slim_test(test: dict) -> None:
    for part in test.get("parts") or []:
        part.pop("segments", None)
        part.pop("transcript", None)
        part.pop("ssml_asset", None)
    for question in test.get("questions") or []:
        question.pop("teacher_review_status", None)
        question.pop("source_status", None)


def load_bank() -> dict:
    global _bank, _tests_by_id, _catalog
    if _bank is not None:
        return _bank
    path = Path(settings.LISTENING_BANK_PATH)
    if not path.exists():
        logger.error("Listening bank not found at %s", path)
        _bank = {"meta": {}, "scoring": {}, "question_type_catalog": [], "tests": []}
        return _bank
    with open(path, "r", encoding="utf-8") as fh:
        _bank = json.load(fh)
    ingest_raw_folder(
        Path(settings.RAW_IMPORT_DIR),
        Path(settings.READING_IMPORT_DIR),
        Path(settings.LISTENING_IMPORT_DIR),
    )
    merge_listening_imports(_bank, Path(settings.LISTENING_IMPORT_DIR))
    merge_listening_imports(_bank, Path(settings.LISTENING_PACKS_DIR))
    for test in _bank.get("tests") or []:
        _slim_test(test)
        _tests_by_id[test.get("id")] = test
    logger.info("Loaded listening bank: %s tests.", len(_bank.get("tests") or []))
    return _bank


def all_tests() -> list[dict]:
    return list((load_bank().get("tests") or []))


def get_test(test_id: str) -> Optional[dict]:
    load_bank()
    test = _tests_by_id.get(test_id)
    return deepcopy(test) if test else None


def thresholds() -> list[dict]:
    return list((load_bank().get("scoring") or {}).get("thresholds") or [])


def catalog() -> dict:
    global _catalog
    data = load_bank()
    if _catalog is not None:
        return _catalog

    def _brief(test: dict) -> dict:
        extra = book_fields(test, module="listening")
        return {
            "id": test.get("id"),
            "title": test.get("title"),
            "duration_minutes": test.get("duration_minutes"),
            "part_count": test.get("part_count"),
            "question_count": test.get("question_count"),
            "audio_status": test.get("audio_status"),
            **extra,
            "parts": [
                {"id": p.get("id"), "part_number": p.get("part_number"), "title": p.get("title")}
                for p in test.get("parts") or []
            ],
        }

    tests = [_brief(t) for t in data.get("tests") or []]
    _catalog = {
        "question_types": data.get("question_type_catalog") or [],
        "tests": tests,
        "books": books_from_tests(tests),
        "note": "Original IELTS-style practice — not official IELTS material. Preview TTS audio.",
    }
    return _catalog


def slice_test(
    test: dict,
    *,
    part_id: Optional[str] = None,
    question_type: Optional[str] = None,
) -> dict:
    sliced = deepcopy(test)
    questions = list(sliced.get("questions") or [])
    if part_id:
        questions = [q for q in questions if q.get("part_id") == part_id]
        sliced["parts"] = [p for p in sliced.get("parts") or [] if p.get("id") == part_id]
        sliced["title"] = f"{sliced.get('title')} — Part practice"
        sliced["duration_minutes"] = 8
    if question_type:
        questions = [q for q in questions if q.get("type") == question_type]
        part_ids = {q.get("part_id") for q in questions}
        sliced["parts"] = [p for p in sliced.get("parts") or [] if p.get("id") in part_ids]
        sliced["title"] = f"{sliced.get('title')} — {question_type.replace('_', ' ')}"
        sliced["duration_minutes"] = 15
    sliced["questions"] = questions
    sliced["question_count"] = len(questions)
    sliced["part_count"] = len(sliced.get("parts") or [])
    return sliced


def questions_by_type(question_type: str, limit: int = 10) -> Optional[dict]:
    collected = []
    parts = {}
    source_title = "Question-type practice"
    for test in all_tests():
        for q in test.get("questions") or []:
            if q.get("type") != question_type:
                continue
            collected.append(q)
            pid = q.get("part_id")
            if pid and pid not in parts:
                for p in test.get("parts") or []:
                    if p.get("id") == pid:
                        parts[pid] = p
                        source_title = test.get("title") or source_title
                        break
            if len(collected) >= limit:
                break
        if len(collected) >= limit:
            break
    if not collected:
        return None
    return {
        "id": f"practice-{question_type}",
        "title": f"{source_title} — {question_type.replace('_', ' ')}",
        "duration_minutes": 15,
        "audio_status": "preview_tts_included_replace_before_production",
        "parts": list(parts.values()),
        "questions": collected,
        "question_count": len(collected),
        "part_count": len(parts),
        "instructions": ["Practice one question type. Transcripts stay hidden until you submit."],
    }
