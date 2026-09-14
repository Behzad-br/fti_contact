"""Import IELTS Writing starter bank JSON/CSV into SQLite."""
from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.writing.models import WritingQuestion
from app.writing.services.writing_core import (
    is_duplicate_prompt,
    parse_json_maybe,
    validate_visual_data,
)

logger = logging.getLogger(__name__)

STATUS_MAP = {
    "draft_review_required": "review",
    "review": "review",
    "draft": "draft",
    "published": "published",
    "archived": "archived",
}


def _map_status(raw: Optional[str], force_status: Optional[str] = None) -> str:
    if force_status:
        return force_status
    return STATUS_MAP.get((raw or "").strip(), "review")


def record_from_bank_item(item: dict, force_status: Optional[str] = None) -> dict:
    test_type = item.get("test_type") or item.get("testType")
    task = int(item.get("task") or item.get("task_number") or 1)
    question_type = item.get("question_type")
    prompt = (item.get("prompt") or "").strip()
    public_id = str(item.get("id") or item.get("public_id") or "").strip()
    if not public_id:
        raise ValueError("Question is missing id/public_id.")
    if test_type not in ("academic", "general_training"):
        raise ValueError(f"{public_id}: invalid test_type")
    if task not in (1, 2):
        raise ValueError(f"{public_id}: invalid task")
    if not prompt:
        raise ValueError(f"{public_id}: prompt is required")
    if not question_type:
        raise ValueError(f"{public_id}: question_type is required")

    visual = item.get("visual_data")
    image_path = (item.get("image_path") or "").strip() or None
    if image_path or (isinstance(visual, dict) and visual.get("image_only")):
        visual_norm = dict(visual) if isinstance(visual, dict) else {}
        visual_norm["image_only"] = True
        if image_path:
            visual_norm.setdefault("extra_images", visual_norm.get("extra_images") or [])
    else:
        ok, err, visual_norm = validate_visual_data(question_type, visual)
        if not ok:
            raise ValueError(f"{public_id}: {err}")

    bullets = item.get("bullet_points") or item.get("bulletPoints")
    if isinstance(bullets, str):
        bullets = parse_json_maybe(bullets) or [b.strip() for b in bullets.split("|") if b.strip()]

    min_words = int(item.get("minimum_words") or (150 if task == 1 else 250))
    minutes = int(item.get("recommended_minutes") or (20 if task == 1 else 40))
    test_number = item.get("test_number")
    try:
        test_number = int(test_number) if test_number not in (None, "") else None
    except (TypeError, ValueError):
        test_number = None

    return {
        "public_id": public_id,
        "test_type": test_type,
        "task_number": task,
        "question_type": question_type,
        "topic": item.get("topic"),
        "difficulty": item.get("difficulty"),
        "title": item.get("title")
        or ((visual_norm or {}).get("title") if isinstance(visual_norm, dict) else None),
        "prompt": prompt,
        "instructions": item.get("instructions"),
        "minimum_words": min_words,
        "recommended_minutes": minutes,
        "visual_data": visual_norm,
        "image_path": image_path,
        "letter_tone": item.get("letter_tone"),
        "recipient": item.get("recipient"),
        "bullet_points": bullets or [],
        "planning_tags": item.get("planning_tags") or [],
        "source_type": item.get("source_type") or "imported_original",
        "source_reference": item.get("source_reference"),
        "generated_by_ai": bool(item.get("generated_by_ai")),
        "status": _map_status(item.get("publication_status") or item.get("status"), force_status),
        "is_permanent_bank": True,
        "book_id": item.get("book_id"),
        "book_title": item.get("book_title"),
        "test_number": test_number,
        "pack_test_id": item.get("pack_test_id"),
    }


def load_records(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and "questions" in payload:
            return payload["questions"]
        if isinstance(payload, list):
            return payload
        raise ValueError("JSON must be a list or an object with a 'questions' array.")
    if suffix == ".csv":
        with path.open(encoding="utf-8", newline="") as handle:
            return list(csv.DictReader(handle))
    raise ValueError("Unsupported file type. Use .json or .csv")


def import_records(
    db: Session,
    records: list[dict],
    *,
    dry_run: bool = False,
    force_status: Optional[str] = None,
    detect_duplicates: bool = True,
) -> dict:
    imported = 0
    skipped = 0
    invalid = []
    flagged = 0
    existing_prompts = [
        (q.public_id, q.prompt)
        for q in db.query(WritingQuestion.public_id, WritingQuestion.prompt).all()
    ]
    preexisting = list(existing_prompts)

    for raw in records:
        try:
            data = record_from_bank_item(raw, force_status=force_status)
        except Exception as exc:
            invalid.append({"id": raw.get("id"), "error": str(exc)})
            continue

        exists = (
            db.query(WritingQuestion).filter_by(public_id=data["public_id"]).first()
        )
        if exists:
            skipped += 1
            if data.get("pack_test_id"):
                exists.book_id = data.get("book_id")
                exists.book_title = data.get("book_title")
                exists.test_number = data.get("test_number")
                exists.pack_test_id = data.get("pack_test_id")
                exists.image_path = data.get("image_path")
                exists.visual_data = data.get("visual_data")
                exists.prompt = data["prompt"]
                exists.question_type = data["question_type"]
                exists.title = data.get("title")
                exists.topic = data.get("topic")
                exists.letter_tone = data.get("letter_tone")
                exists.recipient = data.get("recipient")
                exists.bullet_points = data.get("bullet_points")
                exists.status = data["status"]
            continue

        dup_of = None
        if detect_duplicates:
            for pid, prompt in preexisting:
                if is_duplicate_prompt(data["prompt"], prompt):
                    dup_of = pid
                    break

        if dry_run:
            imported += 1
            if dup_of:
                flagged += 1
            existing_prompts.append((data["public_id"], data["prompt"]))
            continue

        q = WritingQuestion(
            public_id=data["public_id"],
            test_type=data["test_type"],
            task_number=data["task_number"],
            question_type=data["question_type"],
            topic=data["topic"],
            difficulty=data["difficulty"],
            title=data["title"],
            prompt=data["prompt"],
            instructions=data["instructions"],
            minimum_words=data["minimum_words"],
            recommended_minutes=data["recommended_minutes"],
            image_path=data.get("image_path"),
            letter_tone=data["letter_tone"],
            recipient=data["recipient"],
            source_type=data["source_type"],
            source_reference=data["source_reference"],
            generated_by_ai=data["generated_by_ai"],
            status=data["status"],
            is_permanent_bank=True,
            duplicate_flag=bool(dup_of),
            duplicate_of_id=dup_of,
            book_id=data.get("book_id"),
            book_title=data.get("book_title"),
            test_number=data.get("test_number"),
            pack_test_id=data.get("pack_test_id"),
        )
        q.visual_data = data["visual_data"]
        q.bullet_points = data["bullet_points"]
        q.planning_tags = data["planning_tags"]
        db.add(q)
        imported += 1
        if dup_of:
            flagged += 1
        existing_prompts.append((data["public_id"], data["prompt"]))

    if not dry_run:
        db.commit()

    result = {
        "imported": imported,
        "skipped": skipped,
        "invalid": invalid,
        "duplicate_flagged": flagged,
        "dry_run": dry_run,
    }
    logger.info("Writing bank import: %s", result)
    return result


def import_file(db: Session, path: Path, **kwargs) -> dict:
    return import_records(db, load_records(path), **kwargs)
