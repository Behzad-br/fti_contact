"""Load the original reading practice pack from JSON."""
from __future__ import annotations

import json
import logging
from copy import deepcopy
from pathlib import Path
from typing import Optional

from app.book_meta import book_fields, books_from_tests
from app.config import settings
from app.content_imports import merge_reading_imports
from app.saved_page_ingest import ingest_raw_folder

logger = logging.getLogger(__name__)

_bank: Optional[dict] = None
_tests_by_id: dict[str, dict] = {}
_all_tests: list[dict] = []
_catalog: Optional[dict] = None


def _slim_test(test: dict) -> None:
    """Drop fields that are never used for scoring or the student UI."""
    for passage in test.get("passages") or []:
        passage.pop("text", None)
        for para in passage.get("paragraphs") or []:
            para.pop("sentence_records", None)
    for question in test.get("questions") or []:
        question.pop("teacher_review_status", None)
        question.pop("source_status", None)


def load_bank() -> dict:
    global _bank, _all_tests, _tests_by_id, _catalog
    if _bank is not None:
        return _bank
    path = Path(settings.READING_BANK_PATH)
    if not path.exists():
        logger.error("Reading bank not found at %s", path)
        _bank = {"meta": {}, "structure": {}, "question_types": [], "scoring": {}, "tests": {"academic": [], "general_training": []}}
        return _bank
    with open(path, "r", encoding="utf-8") as fh:
        _bank = json.load(fh)
    ingest_raw_folder(
        Path(settings.RAW_IMPORT_DIR),
        Path(settings.READING_IMPORT_DIR),
        Path(settings.LISTENING_IMPORT_DIR),
    )
    merge_reading_imports(_bank, Path(settings.READING_IMPORT_DIR))
    merge_reading_imports(_bank, Path(settings.READING_PACKS_DIR))
    tests = _bank.get("tests") or {}
    _all_tests = list(tests.get("academic") or []) + list(tests.get("general_training") or [])
    for test in _all_tests:
        _slim_test(test)
        _tests_by_id[test.get("id")] = test
    _catalog = None
    academic = len(tests.get("academic") or [])
    general = len(tests.get("general_training") or [])
    logger.info("Loaded reading bank: %s academic, %s general training tests.", academic, general)
    return _bank


def reload_bank() -> dict:
    global _bank, _tests_by_id, _all_tests, _catalog
    _bank = None
    _tests_by_id = {}
    _all_tests = []
    _catalog = None
    return load_bank()


def all_tests() -> list[dict]:
    load_bank()
    return _all_tests


def get_test(test_id: str) -> Optional[dict]:
    load_bank()
    test = _tests_by_id.get(test_id)
    return deepcopy(test) if test else None


def catalog() -> dict:
    global _catalog
    data = load_bank()
    if _catalog is not None:
        return _catalog

    def _brief(test: dict) -> dict:
        extra = book_fields(test, module="reading", track=str(test.get("test_type") or ""))
        return {
            "id": test.get("id"),
            "title": test.get("title"),
            "test_type": test.get("test_type"),
            "duration_minutes": test.get("duration_minutes"),
            "passage_count": test.get("passage_count"),
            "question_count": test.get("question_count"),
            **extra,
            "passages": [
                {"id": p.get("id"), "title": p.get("title")}
                for p in test.get("passages") or []
            ],
        }

    academic = [_brief(t) for t in (data.get("tests") or {}).get("academic") or []]
    general = [_brief(t) for t in (data.get("tests") or {}).get("general_training") or []]
    _catalog = {
        "question_types": data.get("question_types") or [],
        "academic": academic,
        "general_training": general,
        "books": {
            "academic": books_from_tests(academic),
            "general_training": books_from_tests(general),
        },
    }
    return _catalog


def thresholds_for(test_type: str) -> list[dict]:
    scoring = load_bank().get("scoring") or {}
    if test_type == "general_training":
        return scoring.get("general_training_reading") or []
    return scoring.get("academic_reading") or []


def questions_by_ids(question_ids: list[str]) -> Optional[dict]:
    wanted = [qid for qid in question_ids if qid]
    if not wanted:
        return None
    by_id = {}
    passages = {}
    source = None
    for test in all_tests():
        for q in test.get("questions") or []:
            qid = q.get("id")
            if qid in wanted and qid not in by_id:
                by_id[qid] = q
                source = source or test
                pid = q.get("passage_id")
                if pid and pid not in passages:
                    for p in test.get("passages") or []:
                        if p.get("id") == pid:
                            passages[pid] = p
                            break
        if len(by_id) == len(wanted):
            break
    collected = [by_id[qid] for qid in wanted if qid in by_id]
    if not collected or source is None:
        return None
    return {
        "id": source.get("id"),
        "title": source.get("title"),
        "test_type": source.get("test_type"),
        "duration_minutes": source.get("duration_minutes"),
        "passages": list(passages.values()),
        "questions": collected,
        "question_count": len(collected),
        "instructions": source.get("instructions") or [],
    }


def slice_test(
    test: dict,
    *,
    passage_id: Optional[str] = None,
    question_type: Optional[str] = None,
) -> dict:
    sliced = deepcopy(test)
    questions = list(sliced.get("questions") or [])
    if passage_id:
        questions = [q for q in questions if q.get("passage_id") == passage_id]
        sliced["passages"] = [p for p in sliced.get("passages") or [] if p.get("id") == passage_id]
        sliced["title"] = f"{sliced.get('title')} — Passage practice"
    if question_type:
        questions = [q for q in questions if q.get("type") == question_type]
        passage_ids = {q.get("passage_id") for q in questions}
        sliced["passages"] = [p for p in sliced.get("passages") or [] if p.get("id") in passage_ids]
        sliced["title"] = f"{sliced.get('title')} — {question_type.replace('_', ' ')}"
    sliced["questions"] = questions
    sliced["question_count"] = len(questions)
    return sliced


def questions_by_type(test_type: Optional[str], question_type: str, limit: int = 12) -> Optional[dict]:
    collected = []
    passages = {}
    source_title = "Question-type practice"
    for test in all_tests():
        if test_type and test.get("test_type") != test_type:
            continue
        for q in test.get("questions") or []:
            if q.get("type") != question_type:
                continue
            collected.append(q)
            pid = q.get("passage_id")
            if pid and pid not in passages:
                for p in test.get("passages") or []:
                    if p.get("id") == pid:
                        passages[pid] = p
                        break
            if len(collected) >= limit:
                source_title = test.get("title") or source_title
                break
        if len(collected) >= limit:
            break
    if not collected:
        return None
    return {
        "id": f"practice-{question_type}",
        "title": f"{source_title} — {question_type.replace('_', ' ')}",
        "test_type": test_type or "academic",
        "duration_minutes": 20,
        "passages": list(passages.values()),
        "questions": collected,
        "question_count": len(collected),
        "instructions": ["Practice questions of one type. Answers stay hidden until you submit."],
    }
