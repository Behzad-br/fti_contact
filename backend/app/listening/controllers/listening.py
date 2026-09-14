"""Student IELTS Listening API."""
from __future__ import annotations

from datetime import datetime
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.deps import resolve_student_id as get_student_id
from app.config import settings
from app.archive_asset_store import materialize_archive_asset
from app.database import get_db
from app.listening.models import ListeningAttempt
from app.listening.services import bank
from app.listening.services.generate import ai_review_short_answers
from app.listening.services.scoring import (
    PART_HIDDEN,
    QUESTION_HIDDEN,
    grade_attempt,
    student_safe_test,
)

router = APIRouter()
HIDDEN = QUESTION_HIDDEN | PART_HIDDEN


def _attempt_or_404(db: Session, attempt_id: str, student_id: str) -> ListeningAttempt:
    row = db.query(ListeningAttempt).filter_by(id=attempt_id).first()
    if not row:
        raise HTTPException(404, "Attempt not found.")
    if row.student_id != student_id:
        raise HTTPException(403, "You cannot access another student's attempt.")
    return row


def _build_slice(test_id: str, mode: str, part_id: Optional[str], question_type: Optional[str]) -> dict:
    if mode == "question_type":
        if not question_type:
            raise HTTPException(400, "question_type is required.")
        specific = bank.get_test(test_id)
        if specific:
            sliced = bank.slice_test(specific, question_type=question_type)
            if sliced.get("questions"):
                return sliced
        sliced = bank.questions_by_type(question_type)
        if not sliced:
            raise HTTPException(404, "No questions for that type.")
        return sliced
    test = bank.get_test(test_id)
    if not test:
        raise HTTPException(404, "Listening test not found.")
    if mode == "single_part":
        if not part_id:
            raise HTTPException(400, "part_id is required for part practice.")
        sliced = bank.slice_test(test, part_id=part_id)
        if not sliced.get("questions"):
            raise HTTPException(404, "No questions on that part.")
        return sliced
    return test


def _remaining(row: ListeningAttempt) -> Optional[int]:
    if not row.timed:
        return None
    if row.status != "in_progress" or not row.started_at:
        return row.remaining_seconds
    elapsed = int((datetime.utcnow() - row.started_at).total_seconds())
    return max(0, int(row.duration_seconds or 0) - elapsed)


def _policy(mode: str, timed: bool = True) -> dict:
    if mode in ("full_mock", "ai_full_mock") and timed:
        return {"plays_allowed": 1, "seeking_allowed": False, "label": "mock"}
    return {"plays_allowed": 99, "seeking_allowed": True, "label": "practice"}


def _contains_hidden(obj) -> bool:
    if isinstance(obj, dict):
        return any(k in HIDDEN or _contains_hidden(v) for k, v in obj.items())
    if isinstance(obj, list):
        return any(_contains_hidden(item) for item in obj)
    return False


def _assert_safe(payload: dict) -> None:
    if _contains_hidden(payload):
        raise HTTPException(500, "Server attempted to leak answer keys or transcripts.")


def _payload(row: ListeningAttempt) -> dict:
    sliced = row.snapshot or _build_slice(row.test_id, row.mode, row.scope.get("part_id"), row.scope.get("question_type"))
    policy = _policy(row.mode, bool(row.timed))
    return {
        "attempt_id": row.id,
        "status": row.status,
        "mode": row.mode,
        "timed": bool(row.timed),
        "duration_seconds": row.duration_seconds,
        "remaining_seconds": _remaining(row),
        "responses": row.responses,
        "playback": row.playback,
        "policy": policy,
        "test": student_safe_test(sliced),
    }


class StartAttemptBody(BaseModel):
    test_id: str
    mode: str = "full_mock"
    part_id: Optional[str] = None
    question_type: Optional[str] = None
    timed: bool = True


def _recent_ai_titles(db: Session, student_id: str) -> list[str]:
    rows = (
        db.query(ListeningAttempt)
        .filter(ListeningAttempt.student_id == student_id, ListeningAttempt.mode.in_(("ai_part", "ai_full_mock")))
        .order_by(ListeningAttempt.started_at.desc())
        .limit(8)
        .all()
    )
    titles = []
    for row in rows:
        snap = row.snapshot or {}
        if snap.get("title"):
            titles.append(snap["title"])
        for part in snap.get("parts") or []:
            if part.get("title"):
                titles.append(part["title"])
    return titles


class SaveResponsesBody(BaseModel):
    responses: dict = Field(default_factory=dict)
    remaining_seconds: Optional[int] = None


class AudioStartBody(BaseModel):
    part_id: str


@router.get("/listening/catalog")
async def listening_catalog():
    return bank.catalog()


@router.get("/listening/tests/{test_id}")
async def listening_test(test_id: str, part_id: Optional[str] = None):
    test = bank.get_test(test_id)
    if not test:
        raise HTTPException(404, "Listening test not found.")
    if part_id:
        test = bank.slice_test(test, part_id=part_id)
    safe = student_safe_test(test)
    _assert_safe(safe)
    return safe


@router.get("/listening/practice")
async def listening_practice(question_type: str = Query(...)):
    sliced = bank.questions_by_type(question_type)
    if not sliced:
        raise HTTPException(404, "No questions for that filter.")
    safe = student_safe_test(sliced)
    _assert_safe(safe)
    return safe


@router.post("/listening/attempts")
async def start_attempt(
    body: StartAttemptBody,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    allowed = ("full_mock", "single_part", "question_type", "ai_part", "ai_full_mock")
    if body.mode not in allowed:
        raise HTTPException(400, "mode must be full_mock, single_part, question_type, ai_part, or ai_full_mock")
    if body.mode in ("ai_part", "ai_full_mock"):
        raise HTTPException(400, "AI generate is only available for Speaking.")
    sliced = _build_slice(body.test_id, body.mode, body.part_id, body.question_type)
    minutes = sliced.get("duration_minutes") or (30 if body.mode in ("full_mock", "ai_full_mock") else 8)
    duration = int(minutes) * 60
    row = ListeningAttempt(
        student_id=student_id,
        test_id=sliced.get("id") if body.mode in ("question_type", "ai_part", "ai_full_mock") else body.test_id,
        mode=body.mode,
        timed=1 if body.timed else 0,
        duration_seconds=duration,
        remaining_seconds=duration if body.timed else None,
        status="in_progress",
        started_at=datetime.utcnow(),
    )
    row.scope = {
        "part_id": body.part_id,
        "question_type": body.question_type,
        "question_ids": [q.get("id") for q in sliced.get("questions") or []],
        "generated_by_ai": bool(sliced.get("generated_by_ai")),
    }
    row.snapshot = sliced
    row.responses = {}
    row.playback = {}
    db.add(row)
    db.commit()
    db.refresh(row)
    payload = _payload(row)
    _assert_safe(payload["test"])
    return payload


@router.get("/listening/attempts/{attempt_id}")
async def get_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status == "submitted":
        return {"attempt_id": row.id, "status": row.status, "result": row.result}
    payload = _payload(row)
    _assert_safe(payload["test"])
    return payload


@router.patch("/listening/attempts/{attempt_id}/responses")
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


@router.post("/listening/attempts/{attempt_id}/audio-start")
async def audio_start(
    attempt_id: str,
    body: AudioStartBody,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status != "in_progress":
        raise HTTPException(400, "This attempt is already submitted.")
    policy = _policy(row.mode, bool(row.timed))
    plays = dict(row.playback)
    used = int(plays.get(body.part_id) or 0)
    allowed = int(policy["plays_allowed"])
    if used >= allowed:
        raise HTTPException(403, "This recording can only be played once in a full mock.")
    plays[body.part_id] = used + 1
    row.playback = plays
    db.commit()
    return {"ok": True, "plays_used": plays[body.part_id], "plays_allowed": allowed, "seeking_allowed": policy["seeking_allowed"]}


@router.post("/listening/attempts/{attempt_id}/submit")
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
    sliced = row.snapshot or _build_slice(row.test_id, row.mode, row.scope.get("part_id"), row.scope.get("question_type"))
    result = grade_attempt(sliced, merged, bank.thresholds())
    if sliced.get("generated_by_ai") or row.mode in ("ai_part", "ai_full_mock"):
        result = await ai_review_short_answers(sliced, result)
    row.result = result
    row.estimated_band = result.get("estimated_band")
    row.raw_score = result.get("raw_score")
    row.status = "submitted"
    row.submitted_at = datetime.utcnow()
    db.commit()
    return result


@router.get("/listening/attempts/{attempt_id}/result")
async def get_result(
    attempt_id: str,
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    row = _attempt_or_404(db, attempt_id, student_id)
    if row.status != "submitted" or not row.result:
        raise HTTPException(400, "Submit the attempt before viewing answers and transcripts.")
    return row.result


@router.get("/listening/history")
async def listening_history(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(ListeningAttempt)
        .filter_by(student_id=student_id)
        .order_by(ListeningAttempt.started_at.desc())
        .limit(40)
        .all()
    )
    return {
        "attempts": [
            {
                "id": r.id,
                "test_id": r.test_id,
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


@router.get("/listening/progress")
async def listening_progress(
    db: Session = Depends(get_db),
    student_id: str = Depends(get_student_id),
):
    rows = (
        db.query(ListeningAttempt)
        .filter_by(student_id=student_id, status="submitted")
        .order_by(ListeningAttempt.submitted_at.desc())
        .limit(20)
        .all()
    )
    bands = [r.estimated_band for r in rows if r.estimated_band is not None]
    type_stats: dict[str, dict] = {}
    for r in rows:
        for qtype, stats in ((r.result or {}).get("question_type_breakdown") or {}).items():
            bucket = type_stats.setdefault(qtype, {"correct": 0, "total": 0})
            bucket["correct"] += int(stats.get("correct") or 0)
            bucket["total"] += int(stats.get("total") or 0)
    return {
        "total_submitted": len(rows),
        "average_band": round(sum(bands) / len(bands), 1) if bands else None,
        "recent_bands": bands[:10],
        "question_types": type_stats,
    }


@router.get("/listening/audio/{filename}")
async def listening_audio(filename: str):
    safe = Path(filename).name
    candidates = [
        Path(settings.LISTENING_AUDIO_DIR) / safe,
        Path(settings.LISTENING_AUDIO_DIR).parent / "homework_audio" / safe,
    ]
    path = next((p for p in candidates if p.exists()), None)
    if not path:
        path = materialize_archive_asset(safe, "audio")
    if not path:
        raise HTTPException(404, "Audio not found.")
    return FileResponse(
        path,
        media_type=mimetypes.guess_type(safe)[0] or "audio/mpeg",
        headers={"Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600"},
    )


@router.get("/listening/maps/{filename}")
async def listening_map(filename: str):
    safe = Path(filename).name
    path = Path(settings.LISTENING_MAP_DIR) / safe
    if not path.exists():
        path = materialize_archive_asset(safe, "image")
    if not path or path.suffix.lower() not in {".svg", ".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(404, "Map not found.")
    return FileResponse(path, media_type=mimetypes.guess_type(safe)[0] or "application/octet-stream")
