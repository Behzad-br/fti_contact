"""
services/question_bank.py — Load stored IELTS Speaking tests from JSON.

The question bank lives in data/question_bank.json.
"""
import json
import logging
import random
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_bank: Optional[list] = None  # In-memory cache after first load


def _load_bank() -> list:
    global _bank
    if _bank is not None:
        return _bank

    path = Path(settings.QUESTION_BANK_PATH)
    if not path.exists():
        logger.error("Question bank not found at: %s", path)
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _bank = data if isinstance(data, list) else data.get("tests", [])
        logger.info("Loaded %d stored tests from question bank.", len(_bank))
        return _bank
    except Exception as exc:
        logger.error("Failed to load question bank: %s", exc)
        return []


def list_tests() -> list[dict]:
    """Return all tests (id + title only) for display in UI."""
    bank = _load_bank()
    return [{"id": t["id"], "title": t["title"]} for t in bank]


def get_test(test_id: str) -> Optional[dict]:
    """Return a specific test by ID."""
    bank = _load_bank()
    for test in bank:
        if test.get("id") == test_id:
            return test
    return None


def get_random_test(exclude_ids: Optional[list] = None) -> Optional[dict]:
    """Return a random test, optionally excluding recently-seen test IDs."""
    bank = _load_bank()
    if not bank:
        return None

    candidates = bank
    if exclude_ids:
        candidates = [t for t in bank if t.get("id") not in exclude_ids]
        if not candidates:
            candidates = bank  # Fall back to all if all excluded

    return random.choice(candidates)


def validate_test(test: dict) -> tuple[bool, str]:
    """
    Validate a test dict (from stored bank or AI generator).
    Returns (is_valid, error_message).
    """
    if not isinstance(test, dict):
        return False, "Test must be a dict"

    if not test.get("id"):
        return False, "Missing 'id'"
    if not test.get("title"):
        return False, "Missing 'title'"

    part1 = test.get("part1", [])
    if not isinstance(part1, list) or len(part1) < 3:
        return False, f"part1 must have at least 3 questions, got {len(part1)}"

    part2 = test.get("part2", {})
    if not isinstance(part2, dict):
        return False, "part2 must be a dict"
    if not part2.get("topic"):
        return False, "part2.topic is required"
    if not isinstance(part2.get("bullets", []), list) or len(part2.get("bullets", [])) < 2:
        return False, "part2.bullets must have at least 2 items"

    part3 = test.get("part3", [])
    if not isinstance(part3, list) or len(part3) < 3:
        return False, f"part3 must have at least 3 questions, got {len(part3)}"

    return True, ""
