"""Generate original IELTS-style listening recordings + questions."""
from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Optional

from app.config import settings
from app.llm.client import MinimaxError, minimax_client
from app.listening.services.bank import thresholds
from app.listening.services.scoring import estimated_band

logger = logging.getLogger(__name__)

ALLOWED_TYPES = {
    "form_completion",
    "note_completion",
    "sentence_completion",
    "short_answer",
    "multiple_choice_single",
    "matching",
}

PART_STYLES = {
    1: "Part 1 everyday social dialogue between two speakers booking or arranging something.",
    2: "Part 2 one speaker giving a talk about a public place, event or facilities.",
    3: "Part 3 two or three people discussing a study project in education or training.",
    4: "Part 4 an academic lecture on a simple research topic.",
}

_SYSTEM = """You create ORIGINAL IELTS Listening practice material.
Independent practice only — not an official IELTS test. Do not copy Cambridge or website papers.
Invent names, places and organisations.

Write a spoken script of 280-420 words that a student can listen to.
Every question answer MUST be said clearly in the script.
Short answers: 1-4 words from the recording. Multiple choice needs A-D options.

Return JSON only:
{
  "title": "short title",
  "part": {
    "title": "part title",
    "context": "one sentence",
    "setting": "everyday_social_dialogue",
    "script": "Advisor: ... Caller: ..."
  },
  "questions": [
    {
      "type": "note_completion",
      "instruction": "Complete the notes. Write NO MORE THAN THREE WORDS AND/OR A NUMBER.",
      "prompt": "Date: ____",
      "options": null,
      "answer": "14 May",
      "accepted_answers": ["14 May", "14th May"],
      "evidence": "exact sentence from the script",
      "explanation": "why this is correct"
    }
  ]
}
"""

_REVIEW_SYSTEM = """You mark IELTS Listening short answers for PRACTICE only.
Accept spelling variants, missing 'the', and equivalent times/dates if they mean the same as the key.
Reject a different meaning. Never inflate scores.

Return JSON only:
{"verdicts": [{"question_id": "id", "correct": true, "reason": "short reason"}]}
"""


def _user_prompt(part_number: int, count: int, avoid: list[str], question_type: Optional[str]) -> str:
    type_line = (
        f"ALL {count} questions must be type `{question_type}`."
        if question_type
        else f"Mix these types across {count} questions: note_completion, sentence_completion, short_answer, multiple_choice_single, matching."
    )
    return (
        f"{PART_STYLES.get(part_number, PART_STYLES[1])}\n"
        f"Create exactly {count} questions.\n{type_line}\n"
        f"Do not reuse these titles: {', '.join(avoid[-6:]) or 'none'}.\n"
        "Return JSON only."
    )


def _clean_accepted(question: dict) -> list[str]:
    accepted = question.get("accepted_answers") or []
    if not accepted and question.get("answer") is not None:
        answer = question.get("answer")
        accepted = list(answer) if isinstance(answer, list) else [answer]
    cleaned = []
    for item in accepted:
        text = str(item or "").strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _normalize_question(raw: dict, *, qid: str, number: int, part_id: str, part_number: int) -> dict:
    qtype = str(raw.get("type") or "short_answer").strip()
    if qtype not in ALLOWED_TYPES:
        qtype = "short_answer"
    prompt = str(raw.get("prompt") or "").strip()
    if not prompt:
        raise ValueError(f"Question {number} has no prompt.")
    accepted = _clean_accepted(raw)
    if not accepted:
        raise ValueError(f"Question {number} has no answer key.")
    options = []
    for opt in raw.get("options") or []:
        code = str(opt.get("code") or "").strip()
        text = str(opt.get("text") or "").strip()
        if code and text:
            options.append({"code": code, "text": text})
    if qtype in {"multiple_choice_single", "matching"} and len(options) < 3:
        raise ValueError(f"Question {number} needs options.")
    return {
        "id": qid,
        "number": number,
        "part_number": part_number,
        "part_id": part_id,
        "type": qtype,
        "instruction": str(raw.get("instruction") or "Answer the question.").strip(),
        "prompt": prompt,
        "options": options or None,
        "answer": raw.get("answer") if raw.get("answer") is not None else accepted[0],
        "answer_text": raw.get("answer_text") or accepted[0],
        "accepted_answers": accepted,
        "evidence": (raw.get("evidence") or "").strip() or None,
        "explanation": (raw.get("explanation") or "").strip() or None,
    }


def normalize_generated(raw: dict, *, part_number: int, start_number: int, count: int, token: str) -> dict:
    src = raw.get("part") or raw
    title = str(src.get("title") or raw.get("title") or f"Listening part {part_number}").strip()
    script = str(src.get("script") or "").strip()
    if len(script.split()) < 80:
        raise ValueError("Generated script is too short.")
    part_id = f"ai-{token}-p{part_number}"
    questions = []
    for item in raw.get("questions") or []:
        if len(questions) >= count:
            break
        number = start_number + len(questions)
        questions.append(
            _normalize_question(
                item,
                qid=f"{part_id}-q{number:02d}",
                number=number,
                part_id=part_id,
                part_number=part_number,
            )
        )
    if len(questions) < max(6, count - 2):
        raise ValueError(f"Generator returned too few questions ({len(questions)}).")
    return {
        "title": title,
        "part": {
            "id": part_id,
            "part_number": part_number,
            "title": title,
            "context": str(src.get("context") or "").strip(),
            "setting": str(src.get("setting") or "everyday_social_dialogue"),
            "script": script,
        },
        "questions": questions,
    }


async def _write_audio(script: str, filename: str, voice: str) -> str:
    audio_dir = Path(settings.LISTENING_AUDIO_DIR)
    audio_dir.mkdir(parents=True, exist_ok=True)
    path = audio_dir / filename
    data = await minimax_client.speech_mp3(script, voice=voice)
    path.write_bytes(data)
    if path.stat().st_size < 1000:
        raise MinimaxError("Generated audio file was empty.")
    return filename


async def _generate_one(
    *,
    part_number: int,
    count: int,
    start_number: int,
    token: str,
    avoid: list[str],
    question_type: Optional[str],
) -> dict:
    user = _user_prompt(part_number, count, avoid, question_type)
    last_error: Optional[Exception] = None
    voices = {1: "alloy", 2: "onyx", 3: "nova", 4: "echo"}
    for _ in range(2):
        try:
            raw = await minimax_client.chat_json(_SYSTEM, user, retries=1, max_tokens=7000)
            part = normalize_generated(
                raw,
                part_number=part_number,
                start_number=start_number,
                count=count,
                token=token,
            )
            filename = f"{part['part']['id']}.mp3"
            part["part"]["audio_file"] = await _write_audio(part["part"]["script"], filename, voices.get(part_number, "alloy"))
            part["part"]["audio_asset"] = filename
            return part
        except (MinimaxError, ValueError, TypeError) as exc:
            last_error = exc
            logger.warning("Listening AI generation failed: %s", exc)
    raise MinimaxError(str(last_error) or "Could not generate a listening part.")


async def generate_ai_listening(
    *,
    full_mock: bool = False,
    question_type: Optional[str] = None,
    avoid_titles: Optional[list[str]] = None,
    part_number: int = 1,
) -> dict:
    if question_type and question_type not in ALLOWED_TYPES:
        raise ValueError("That question type cannot be generated for AI listening.")
    token = uuid.uuid4().hex[:8]
    avoid = list(avoid_titles or [])
    if full_mock and not question_type:
        parts = []
        start = 1
        for idx, count in enumerate((10, 10, 10, 10), start=1):
            piece = await _generate_one(
                part_number=idx,
                count=count,
                start_number=start,
                token=token,
                avoid=avoid,
                question_type=None,
            )
            avoid.append(piece["part"]["title"])
            parts.append(piece)
            start += count
        questions = [q for piece in parts for q in piece["questions"]]
        return {
            "id": f"ai-listen-full-{token}",
            "title": "Fresh AI Listening Mock",
            "duration_minutes": 30,
            "generated_by_ai": True,
            "audio_status": "ai_tts_preview",
            "instructions": [
                "AI-generated listening practice. Transcripts stay hidden until you submit.",
                "AI checks short answers after submit. Estimated practice band only.",
            ],
            "parts": [p["part"] for p in parts],
            "questions": questions,
        }

    count = 8 if question_type else 10
    piece = await _generate_one(
        part_number=max(1, min(int(part_number or 1), 4)),
        count=count,
        start_number=1,
        token=token,
        avoid=avoid,
        question_type=question_type,
    )
    return {
        "id": f"ai-listen-part-{token}",
        "title": f"Fresh AI Listening — {piece['part']['title']}",
        "duration_minutes": 8,
        "generated_by_ai": True,
        "audio_status": "ai_tts_preview",
        "instructions": [
            "AI-generated part practice. Transcripts stay hidden until you submit.",
            "AI checks short answers after submit. Not a full-test band.",
        ],
        "parts": [piece["part"]],
        "questions": piece["questions"],
    }


async def ai_review_short_answers(test: dict, result: dict) -> dict:
    """Let the LLM accept equivalent short answers that failed exact matching."""
    by_id = {q.get("id"): q for q in test.get("questions") or []}
    pending = []
    for row in result.get("details") or []:
        if row.get("correct") or row.get("unanswered"):
            continue
        question = by_id.get(row.get("question_id")) or {}
        qtype = question.get("type") or row.get("question_type")
        if qtype in {"multiple_choice_single", "multiple_choice_multiple", "matching"}:
            continue
        pending.append(
            {
                "question_id": row.get("question_id"),
                "prompt": question.get("prompt") or row.get("prompt"),
                "submitted": row.get("submitted_answer"),
                "accepted_answers": question.get("accepted_answers") or [question.get("answer")],
                "evidence": question.get("evidence"),
            }
        )
    if not pending:
        result["graded_by"] = "answer_key"
        result["generated_by_ai"] = bool(test.get("generated_by_ai"))
        return result

    try:
        raw = await minimax_client.chat_json(
            _REVIEW_SYSTEM,
            f"Mark these practice answers:\n{pending}",
            retries=1,
            max_tokens=1500,
        )
        verdicts = {item.get("question_id"): item for item in (raw.get("verdicts") or []) if isinstance(item, dict)}
    except MinimaxError as exc:
        logger.warning("Listening AI review failed: %s", exc)
        result["graded_by"] = "answer_key"
        result["generated_by_ai"] = bool(test.get("generated_by_ai"))
        result["ai_review_error"] = "AI review unavailable; exact answer keys were used."
        return result

    for row in result.get("details") or []:
        verdict = verdicts.get(row.get("question_id"))
        if verdict and verdict.get("correct") and not row.get("correct"):
            row["correct"] = True
            row["ai_accepted"] = True
            if verdict.get("reason"):
                row["explanation"] = f"{row.get('explanation') or ''} AI check: {verdict['reason']}".strip()

    correct = sum(1 for row in result["details"] if row["correct"])
    unanswered = sum(1 for row in result["details"] if row["unanswered"])
    total = len(result["details"])
    breakdown: dict[str, dict] = {}
    for row in result["details"]:
        bucket = breakdown.setdefault(row["question_type"], {"correct": 0, "total": 0})
        bucket["total"] += 1
        if row["correct"]:
            bucket["correct"] += 1
    result["correct"] = correct
    result["raw_score"] = correct
    result["incorrect"] = total - correct - unanswered
    result["question_type_breakdown"] = breakdown
    if total >= 40:
        result["estimated_band"] = estimated_band(correct, thresholds(), total)
    result["graded_by"] = "ai"
    result["generated_by_ai"] = True
    result["score_note"] = "AI-checked practice result. Not an official IELTS score."
    return result
