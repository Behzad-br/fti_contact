"""Merge user-supplied bank JSON from data/imports (authorized files only)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _iter_import_files(import_dir: Path):
    if not import_dir.is_dir():
        return
    seen: set[Path] = set()
    for path in sorted(import_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        seen.add(path)
        yield path
    for path in sorted(import_dir.rglob("bank.json")):
        if path in seen:
            continue
        yield path


def _load_json(path: Path) -> dict | list | None:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Skipping import file %s: %s", path, exc)
        return None


def merge_reading_imports(bank: dict, import_dir: Path) -> int:
    tests = bank.setdefault("tests", {})
    academic = tests.setdefault("academic", [])
    general = tests.setdefault("general_training", [])
    seen = {t.get("id") for t in academic + general if t.get("id")}
    added = 0

    def _append(test: dict) -> None:
        nonlocal added
        tid = test.get("id")
        if not tid or not test.get("passages") or not test.get("questions"):
            logger.warning("Reading import skipped (need id, passages, questions): %s", tid)
            return
        if tid in seen:
            logger.warning("Reading import skipped (duplicate id): %s", tid)
            return
        kind = (test.get("test_type") or "academic").lower()
        bucket = general if kind in {"general", "general_training", "gt"} else academic
        if not test.get("test_type"):
            test["test_type"] = "general_training" if bucket is general else "academic"
        bucket.append(test)
        seen.add(tid)
        added += 1

    for path in _iter_import_files(import_dir) or ():
        payload = _load_json(path)
        if not isinstance(payload, dict):
            continue
        nested = payload.get("tests")
        if isinstance(nested, dict):
            for item in nested.get("academic") or []:
                if isinstance(item, dict):
                    item.setdefault("test_type", "academic")
                    _append(item)
            for item in nested.get("general_training") or []:
                if isinstance(item, dict):
                    item.setdefault("test_type", "general_training")
                    _append(item)
        elif isinstance(nested, list):
            default_type = payload.get("test_type") or "academic"
            for item in nested:
                if isinstance(item, dict):
                    item.setdefault("test_type", default_type)
                    _append(item)
        elif payload.get("id"):
            _append(payload)

    if added:
        logger.info("Merged %s authorized reading test(s) from %s", added, import_dir)
    return added


def merge_listening_imports(bank: dict, import_dir: Path) -> int:
    tests = bank.setdefault("tests", [])
    if not isinstance(tests, list):
        return 0
    seen = {t.get("id") for t in tests if t.get("id")}
    added = 0

    def _append(test: dict) -> None:
        nonlocal added
        tid = test.get("id")
        if not tid or not test.get("parts") or not test.get("questions"):
            logger.warning("Listening import skipped (need id, parts, questions): %s", tid)
            return
        if tid in seen:
            logger.warning("Listening import skipped (duplicate id): %s", tid)
            return
        tests.append(test)
        seen.add(tid)
        added += 1

    for path in _iter_import_files(import_dir) or ():
        payload = _load_json(path)
        if not isinstance(payload, dict):
            continue
        nested = payload.get("tests")
        if isinstance(nested, list):
            for item in nested:
                if isinstance(item, dict):
                    _append(item)
        elif payload.get("id"):
            _append(payload)

    if added:
        logger.info("Merged %s authorized listening test(s) from %s", added, import_dir)
    return added
