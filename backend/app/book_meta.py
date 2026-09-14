"""Book + test-number metadata for catalog grouping."""
from __future__ import annotations

import re
from typing import Any


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "book"


def _num_from(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    match = re.search(r"(\d+)", str(value))
    return int(match.group(1)) if match else None


def book_fields(test: dict, *, module: str, track: str = "") -> dict:
    nested = test.get("book") if isinstance(test.get("book"), dict) else {}
    title_src = " ".join(
        str(x or "")
        for x in (
            nested.get("title"),
            test.get("book_title"),
            test.get("title"),
            test.get("id"),
        )
    )
    book_title = (nested.get("title") or test.get("book_title") or "").strip()
    book_id = (nested.get("id") or test.get("book_id") or "").strip()
    test_number = _num_from(nested.get("test_number") or test.get("test_number"))

    series = re.search(r"(cambridge\s+ielts\s+\d+)", title_src, re.I)
    if series:
        book_title = book_title or series.group(1).title().replace("Ielts", "IELTS")
        book_id = book_id or _slug(book_title)
    if not book_title:
        if str(test.get("id") or "").startswith("imported-"):
            book_title = "Imported tests"
            book_id = book_id or f"imported-{module}-{track or 'all'}"
        elif module == "reading":
            if track == "general_training":
                book_title = "FTI Reading · General Training"
                book_id = "fti-reading-gt"
            else:
                book_title = "FTI Reading · Academic"
                book_id = "fti-reading-academic"
        elif module == "listening":
            book_title = "FTI Listening"
            book_id = "fti-listening"
        elif module == "writing":
            book_title = "FTI Writing"
            book_id = "fti-writing"
        else:
            book_title = "FTI Speaking"
            book_id = "fti-speaking"
    if not book_id:
        book_id = _slug(book_title)

    if test_number is None:
        from_title = re.search(r"(?:test|t)[\s_-]*(\d+)\b", title_src, re.I)
        from_id = re.search(r"-(\d+)$", str(test.get("id") or ""))
        test_number = int(from_title.group(1)) if from_title else (int(from_id.group(1)) if from_id else 1)

    return {
        "book_id": book_id,
        "book_title": book_title,
        "test_number": test_number,
    }


def books_from_tests(tests: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for test in tests:
        bid = test.get("book_id") or "book"
        bucket = grouped.setdefault(
            bid,
            {
                "id": bid,
                "title": test.get("book_title") or bid,
                "test_count": 0,
                "tests": [],
            },
        )
        bucket["test_count"] += 1
        bucket["tests"].append(
            {
                "id": test.get("id"),
                "title": test.get("title"),
                "test_number": test.get("test_number"),
            }
        )
    for bucket in grouped.values():
        bucket["tests"].sort(key=lambda t: (t.get("test_number") or 0, t.get("title") or ""))
    return list(grouped.values())

