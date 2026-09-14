"""Student IELTS Reading API."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import resolve_student_id as get_student_id
from app.config import settings
from app.database import get_db
from app.reading.models import ReadingAttempt
from app.reading.services import bank
from app.reading.services.scoring import SERVER_ONLY_FIELDS, grade_attempt, student_safe_test

router = APIRouter()


def _attempt_or_404(db: Session, attempt_id: str, student_id: str) -> ReadingAttempt:
    row = db.query(ReadingAttempt).filter_by(id=attempt_id).first()
    if not row:
        raise HTTPException(404, "Attempt not found.")
    if row.student_id != student_id:
        raise HTTPException(403, "You cannot access another student's attempt.")
    return row


def _build_slice(body_test_id: str, mode: str, passage_id: Optional[str], question_type: Optional[str]) -> dict:
    if mode == "question_type":
        if not question_type:
            raise HTTPException(400, "question_type is required for this mode.")
        specific = bank.get_test(body_test_id)
        if specific:
            sliced = bank.slice_test(specific, question_type=question_type)
            if sliced.get("questions"):
                return sliced
        test_type = body_test_id if body_test_id in ("academic", "general_training") else None
        sliced = bank.questions_by_type(test_type, question_type)
        if not sliced:
            raise HTTPException(404, "No questions for that type.")
        return sliced

    test = bank.get_test(body_test_id)
    if not test:
        raise HTTPException(404, "Reading test not found.")
    if mode == "single_passage":
        if not passage_id:
            raise HTTPException(400, "passage_id is required for passage practice.")
        sliced = bank.slice_test(test, passage_id=passage_id)
        if not sliced.get("questions"):
            raise HTTPException(404, "No questions on that passage.")
        return sliced
    return test


def _remaining(row: ReadingAttempt) -> Optional[int]:
    if not row.timed:
        return None
    if row.status != "in_progress" or not row.started_at:
        return row.remaining_seconds
    elapsed = int((datetime.utcnow() - row.started_at).total_seconds())
    return max(0, int(row.duration_seconds or 0) - elapsed)


def _payload_for_attempt(row: ReadingAttempt) -> dict:
    sliced = _rebuild_sliced(row)
    return {
        "attempt_id": row.id,
        "status": row.status,
        "mode": row.mode,
        "timed": bool(row.timed),
        "duration_seconds": row.duration_seconds,
        "remaining_seconds": _remaining(row),
        "responses": row.responses,
        "test": student_safe_test(sliced),
    }


def _rebuild_sliced(row: ReadingAttempt) -> dict:
    if row.snapshot:
        return row.snapshot
    scope = row.scope or {}
    question_ids = scope.get("question_ids") or []
    if question_ids:
        sliced = bank.questions_by_ids(question_ids)
        if sliced:
            if row.mode == "question_type":
                sliced["title"] = f"{sliced.get('title')} — {(scope.get('question_type') or '').replace('_', ' ')}"
                sliced["duration_minutes"] = max(1, int((row.duration_seconds or 1200) / 60))
            return sliced
    return _build_slice(
        row.test_id if row.mode != "question_type" else (scope.get("pool") or row.test_type),
        row.mode,
        scope.get("passage_id"),
        scope.get("question_type"),
    )


def _contains_server_keys(obj) -> bool:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in SERVER_ONLY_FIELDS:
                return True
            if _contains_server_keys(value):
                return True
        return False
    if isinstance(obj, list):
        return any(_contains_server_keys(item) for item in obj)
    return False


def _assert_safe(payload: dict) -> None:
    if _contains_server_keys(payload):
        raise HTTPException(500, "Server attempted to leak answer keys.")


class StartAttemptBody(BaseModel):
    test_id: str
    mode: str = "full_mock"
    passage_id: Optional[str] = None
    question_type: Optional[str] = None
    timed: bool = True


def _recent_ai_titles(db: Session, student_id: str) -> list[str]:
    rows = (
        db.query(ReadingAttempt)
        .filter(ReadingAttempt.student_id == student_id, ReadingAttempt.mode.in_(("ai_passage", "ai_full_mock")))
        .order_by(ReadingAttempt.started_at.desc())
        .limit(8)
        .all()
    )
    titles = []
    for row in rows:
        snap = row.snapshot or {}
        for passage in snap.get("passages") or []:
            if passage.get("title"):
                titles.append(passage["title"])
    return titles


class SaveResponsesBody(BaseModel):
    responses: dict = Field(default_factory=dict)
    remaining_seconds: Optional[int] = None


@router.get("/reading/catalog")
async def reading_catalog():
    return bank.catalog()


@router.get("/reading/tests/{test_id}")
async def reading_test(test_id: str, passage_id: Optional[str] = None):
    test = bank.get_test(test_id)
    if not test:
        raise HTTPException(404, "Reading test not found.")
    if passage_id:
        test = bank.slice_test(test, passage_id=passage_id)
    safe = student_safe_test(test)
    _assert_safe(safe)
    return safe


@router.get("/reading/practice")
async def reading_practice(
    question_type: str = Query(...),
    test_type: Optional[str] = Query(None),
):
    sliced = bank.questions_by_type(test_type, question_type)
    if not sliced:
        raise HTTPException(404, "No questions for that filter.")
    safe = student_safe_test(sliced)
    _assert_safe(safe)
    return safe


@router.post("/reading/attempts")
async def start_attempt(
    body: StartAttemptBody,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    allowed = ("full_mock", "single_passage", "question_type", "ai_passage", "ai_full_mock")
    if body.mode not in allowed:
        raise HTTPException(400, "mode must be full_mock, single_passage, question_type, ai_passage, or ai_full_mock")

    if body.mode in ("ai_passage", "ai_full_mock"):
        raise HTTPException(400, "AI generate is only available for Speaking.")
    sliced = _build_slice(body.test_id, body.mode, body.passage_id, body.question_type)

    minutes = sliced.get("duration_minutes") or (60 if body.mode in ("full_mock", "ai_full_mock") else 20)
    duration = int(minutes) * 60
    row = ReadingAttempt(
        student_id=student_id,
        test_id=sliced.get("id") if body.mode in ("question_type", "ai_passage", "ai_full_mock") else body.test_id,
        test_type=sliced.get("test_type") or "academic",
        mode=body.mode,
        timed=1 if body.timed else 0,
        duration_seconds=duration,
        remaining_seconds=duration if body.timed else None,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    row.scope = {
        "passage_id": body.passage_id,
        "question_type": body.question_type,
        "pool": body.test_id if body.mode in ("question_type", "ai_passage", "ai_full_mock") else None,
        "question_ids": [q.get("id") for q in sliced.get("questions") or []],
        "generated_by_ai": bool(sliced.get("generated_by_ai")),
    }
    row.snapshot = sliced
    row.responses = {}
    db.add(row)
    db.commit()
    db.refresh(row)
    payload = _payload_for_attempt(row)
    _assert_safe(payload["test"])
    return payload


@router.get("/reading/attempts/{attempt_id}")
async def get_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status == "submitted":
        return {
            "attempt_id": row.id,
            "status": row.status,
            "result": row.result,
        }
    payload = _payload_for_attempt(row)
    _assert_safe(payload["test"])
    return payload


@router.patch("/reading/attempts/{attempt_id}/responses")
async def save_responses(
    attempt_id: str,
    body: SaveResponsesBody,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status != "in_progress":
        raise HTTPException(400, "This attempt is already submitted.")
    merged = dict(row.responses)
    for key, value in (body.responses or {}).items():
        merged[str(key)] = value
    row.responses = merged
    if body.remaining_seconds is not None:
        row.remaining_seconds = max(0, int(body.remaining_seconds))
    db.commit()
    return {"ok": True, "saved": len(merged)}


@router.post("/reading/attempts/{attempt_id}/submit")
async def submit_attempt(
    attempt_id: str,
    body: SaveResponsesBody,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status == "submitted" and row.result:
        return row.result
    merged = dict(row.responses)
    for key, value in (body.responses or {}).items():
        merged[str(key)] = value
    row.responses = merged
    sliced = _rebuild_sliced(row)
    result = grade_attempt(sliced, merged, bank.thresholds_for(row.test_type))
    row.result = result
    row.estimated_band = result.get("estimated_band")
    row.raw_score = result.get("raw_score")
    row.status = "submitted"
    row.submitted_at = datetime.utcnow()
    if body.remaining_seconds is not None:
        row.remaining_seconds = max(0, int(body.remaining_seconds))
    db.commit()
    return result


@router.get("/reading/attempts/{attempt_id}/result")
async def get_result(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status != "submitted" or not row.result:
        raise HTTPException(400, "Submit the attempt before viewing answers.")
    return row.result


@router.get("/reading/history")
async def reading_history(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(ReadingAttempt)
        .filter_by(student_id=student_id)
        .order_by(ReadingAttempt.started_at.desc())
        .limit(40)
        .all()
    )
    return {
        "attempts": [
            {
                "id": r.id,
                "test_id": r.test_id,
                "test_type": r.test_type,
                "mode": r.mode,
                "status": r.status,
                "estimated_band": r.estimated_band,
                "raw_score": r.raw_score,
                "started_at": r.started_at,
                "submitted_at": r.submitted_at,
            }
            for r in rows
        ]
    }


@router.get("/reading/progress")
async def reading_progress(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(ReadingAttempt)
        .filter_by(student_id=student_id, status="submitted")
        .order_by(ReadingAttempt.submitted_at.desc())
        .limit(20)
        .all()
    )
    bands = [r.estimated_band for r in rows if r.estimated_band is not None]
    type_stats: dict[str, dict] = {}
    for r in rows:
        result = r.result or {}
        for qtype, stats in (result.get("question_type_breakdown") or {}).items():
            bucket = type_stats.setdefault(qtype, {"correct": 0, "total": 0})
            bucket["correct"] += int(stats.get("correct") or 0)
            bucket["total"] += int(stats.get("total") or 0)
    return {
        "total_submitted": len(rows),
        "average_band": round(sum(bands) / len(bands), 1) if bands else None,
        "recent_bands": bands[:10],
        "question_types": type_stats,
    }


_PACK_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}


@router.get("/reading/diagrams/{filename}")
async def reading_diagram(filename: str):
    safe = Path(filename).name
    path = Path(settings.READING_DIAGRAM_DIR) / safe
    if not path.exists() or path.suffix.lower() != ".svg":
        raise HTTPException(404, "Diagram not found.")
    return FileResponse(path, media_type="image/svg+xml")


@router.get("/reading/pack-images/{test_id}/{filename}")
async def reading_pack_image(test_id: str, filename: str):
    test = bank.get_test(test_id)
    rel = (test or {}).get("pack_rel")
    if not test or not rel:
        raise HTTPException(404, "Image not found.")
    safe = Path(filename).name
    root = Path(settings.READING_PACKS_DIR).resolve()
    path = (root / rel / "images" / safe).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(404, "Image not found.") from None
    media = _PACK_IMAGE_TYPES.get(path.suffix.lower())
    if not path.is_file() or not media:
        raise HTTPException(404, "Image not found.")
    return FileResponse(path, media_type=media)
