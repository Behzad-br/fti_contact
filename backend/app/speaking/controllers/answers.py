"""Answer + evaluation controller."""
import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.speaking.models import Evaluation, Question, TestSession
from app.speaking.schemas import AnswerSubmitResponse, EvaluationSchema, NextStepSchema
from app.speaking.services import speaking_session
from app.speaking.services.evaluation import evaluate_session
from app.speaking.services.fluency_metrics import calculate_metrics
from app.speaking.services.relevance import score_relevance
from app.speaking.services.speech_quality import speech_status
from app.speaking.services.transcription import transcribe_audio
from app.speaking.views import evaluation_to_schema, question_to_schema

logger = logging.getLogger(__name__)
router = APIRouter()

_MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@router.post("/answers/submit", response_model=AnswerSubmitResponse)
async def submit_answer(
    session_id: str = Form(...),
    question_id: str = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    logger.info("Received submit_answer for session %s question %s", session_id, question_id)

    session = db.query(TestSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not in progress.")

    question = db.query(Question).filter_by(id=question_id, session_id=session_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found.")

    audio_bytes = await audio.read()
    if len(audio_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file too large. Max size: {settings.MAX_UPLOAD_SIZE_MB}MB.",
        )
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio recording. Please record again.")

    filename = Path(audio.filename or "audio.webm").name
    try:
        transcription = await transcribe_audio(audio_bytes, filename)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.error("Transcription failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not transcribe audio: {exc}")

    transcript = transcription["transcript"]
    duration = transcription["duration"]
    quality = speech_status(
        transcript,
        duration,
        part=question.part,
        rms=transcription.get("rms"),
        no_speech_prob=transcription.get("no_speech_prob"),
    )
    if quality["insufficient"]:
        raise HTTPException(
            status_code=400,
            detail=quality["reason"] or "No speech detected. Please record a full spoken answer.",
        )

    extra = question.cue_card_topic or ""
    if question.cue_card_bullets:
        extra = extra + " " + " ".join(question.cue_card_bullets)
    relevance = score_relevance(question.question_text, transcript, extra)
    if relevance["label"] == "off_topic":
        raise HTTPException(
            status_code=400,
            detail=f"That answer was not about this question. Please answer: {question.question_text}",
        )

    metrics = calculate_metrics(transcript, duration)
    answer = speaking_session.save_answer(
        db=db,
        session_id=session_id,
        question_id=question_id,
        transcript=transcript,
        duration=duration,
        word_count=metrics["word_count"],
        filler_count=metrics["filler_count"],
        words_per_minute=metrics.get("words_per_minute"),
    )

    if speaking_session.is_session_complete(db, session_id):
        next_step = NextStepSchema(action="complete", session_id=session_id)
    else:
        next_q = speaking_session.get_current_question(db, session_id)
        if next_q:
            progress = speaking_session.get_session_progress(db, session_id)
            total = (
                progress["total_part1"] if next_q.part == 1
                else progress["total_part2"] if next_q.part == 2
                else progress["total_part3"]
            )
            next_step = NextStepSchema(
                action="next_question",
                question=question_to_schema(next_q),
                session_id=session_id,
                part=next_q.part,
                question_number=next_q.order_idx + 1,
                total_questions=total,
            )
        else:
            next_step = NextStepSchema(action="complete", session_id=session_id)

    return AnswerSubmitResponse(
        answer_id=answer.id,
        transcript=transcript,
        duration=duration,
        word_count=metrics["word_count"],
        next_step=next_step,
    )


@router.post("/answers/finalize/{session_id}", response_model=EvaluationSchema)
async def finalize_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(TestSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    existing = db.query(Evaluation).filter_by(session_id=session_id).first()
    if existing:
        return evaluation_to_schema(existing)

    if not speaking_session.is_session_complete(db, session_id):
        raise HTTPException(
            status_code=400,
            detail="Session is not complete. Answer all questions before requesting evaluation.",
        )

    qa_pairs = speaking_session.build_full_transcript(db, session_id)
    try:
        result = await evaluate_session(qa_pairs)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    eval_row = Evaluation(session_id=session_id)
    eval_row.fluency_coherence = result.get("fluency_coherence")
    eval_row.lexical_resource = result.get("lexical_resource")
    eval_row.grammar = result.get("grammar")
    eval_row.pronunciation = "Not assessed in this version"
    eval_row.estimated_band = result.get("estimated_band")
    eval_row.strengths = result.get("strengths", [])
    eval_row.weaknesses = result.get("weaknesses", [])
    eval_row.corrections = result.get("corrections", [])
    eval_row.detailed_feedback = result.get("detailed_feedback")
    eval_row.part1_feedback = result.get("part1_feedback")
    eval_row.part2_feedback = result.get("part2_feedback")
    eval_row.part3_feedback = result.get("part3_feedback")
    eval_row.improvement_tips = result.get("improvement_tips")
    extras = {
        "why_this_band": result.get("why_this_band") or [],
        "better_versions": result.get("better_versions") or [],
        "task_relevance": result.get("task_relevance"),
        "ai_status": result.get("ai_status") or "ai",
    }
    try:
        payload = json.loads(result.get("raw_ai_response") or "{}")
        if not isinstance(payload, dict):
            payload = {"raw": payload}
    except json.JSONDecodeError:
        payload = {}
    payload.update(extras)
    eval_row.raw_ai_response = json.dumps(payload)
    db.add(eval_row)

    speaking_session.complete_session(
        db, session_id, estimated_band=result.get("estimated_band")
    )
    return evaluation_to_schema(eval_row, task_relevance=result.get("task_relevance"))
