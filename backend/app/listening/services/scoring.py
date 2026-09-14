"""Listening scoring — matches pack result-engine.mjs."""
from __future__ import annotations

import html
import re
import unicodedata


QUESTION_HIDDEN = {
    "answer",
    "answer_text",
    "accepted_answers",
    "evidence",
    "source_locator",
    "explanation",
}
PART_HIDDEN = {"segments", "transcript", "ssml_asset", "script"}


def normalize_answer(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    text = "".join(ch if ch.isalnum() else " " for ch in text)
    return re.sub(r"\s+", " ", text).strip()


def _normalized_set(value) -> list[str]:
    if isinstance(value, list):
        items = value
    elif value is None or value == "":
        items = []
    else:
        items = [value]
    seen = []
    for item in items:
        norm = normalize_answer(item)
        if norm and norm not in seen:
            seen.append(norm)
    return sorted(seen)


def is_correct(question: dict, response) -> bool:
    if question.get("type") == "multiple_choice_multiple":
        expected = _normalized_set(question.get("answer"))
        received = _normalized_set(response)
        return expected == received
    accepted = question.get("accepted_answers") or [question.get("answer")]
    target = normalize_answer(response)
    if not target:
        return False
    return any(normalize_answer(ans) == target for ans in accepted if not isinstance(ans, list))


def is_unanswered(question: dict, response) -> bool:
    if question.get("type") == "multiple_choice_multiple":
        return not _normalized_set(response)
    return normalize_answer(response) == ""


# Official-style IELTS Listening conversion: 1 mark per correct answer, then raw/40 → band.
# IELTS.org averages: 16=5, 23=6, 30=7, 35=8. Half-bands follow IDP/Cambridge practice charts.
LISTENING_BAND_RANGES = (
    (39, 40, 9.0),
    (37, 38, 8.5),
    (35, 36, 8.0),
    (32, 34, 7.5),
    (30, 31, 7.0),
    (26, 29, 6.5),
    (23, 25, 6.0),
    (18, 22, 5.5),
    (16, 17, 5.0),
    (13, 15, 4.5),
    (10, 12, 4.0),
    (8, 9, 3.5),
    (6, 7, 3.0),
    (4, 5, 2.5),
    (3, 3, 2.0),
    (2, 2, 1.5),
    (1, 1, 1.0),
    (0, 0, 0.0),
)


def estimated_band(raw_score: int, thresholds: list[dict] | None = None, out_of: int = 40) -> float:
    """IELTS Listening band from correct answers (raw / 40).

    Matches IELTS.org published averages (16→5, 23→6, 30→7, 35→8) plus the
    standard half-band ranges used by IDP / Cambridge practice charts.
    Blanks and wrong answers give 0 marks. 0 correct = band 0.
    """
    _ = thresholds
    if out_of <= 0 or raw_score <= 0:
        return 0.0
    score = raw_score if out_of == 40 else int(round(raw_score * 40 / out_of))
    score = max(0, min(40, score))
    for low, high, band in LISTENING_BAND_RANGES:
        if low <= score <= high:
            return float(band)
    return 0.0


def conversion_table() -> list[dict]:
    return [{"min": low, "max": high, "band": band} for low, high, band in LISTENING_BAND_RANGES]


def grade_attempt(test: dict, responses: dict, thresholds: list[dict]) -> dict:
    details = []
    for question in test.get("questions") or []:
        qid = question.get("id")
        submitted = responses.get(qid)
        if submitted is None:
            submitted = responses.get(str(question.get("number")))
        if submitted is None:
            submitted = [] if question.get("type") == "multiple_choice_multiple" else ""
        unanswered = is_unanswered(question, submitted)
        correct = False if unanswered else is_correct(question, submitted)
        official = question.get("answer_text") or question.get("answer")
        evidence = question.get("evidence")
        details.append(
            {
                "question_id": qid,
                "question_number": question.get("number"),
                "part_number": question.get("part_number"),
                "question_type": question.get("type"),
                "prompt": question.get("prompt"),
                "submitted_answer": submitted,
                "correct": correct,
                "unanswered": unanswered,
                "correct_answer": question.get("answer"),
                "correct_answer_text": html.unescape(str(official)) if official is not None and not isinstance(official, list) else official,
                "accepted_answers": question.get("accepted_answers") or [],
                "evidence": html.unescape(str(evidence)).strip() if evidence else None,
                "source_locator": question.get("source_locator"),
                "explanation": question.get("explanation"),
            }
        )

    correct = sum(1 for row in details if row["correct"])
    unanswered = sum(1 for row in details if row["unanswered"])
    breakdown: dict[str, dict] = {}
    for row in details:
        bucket = breakdown.setdefault(row["question_type"], {"correct": 0, "total": 0})
        bucket["total"] += 1
        if row["correct"]:
            bucket["correct"] += 1

    total = len(details)
    full_mock = total >= 40
    generated = bool(test.get("generated_by_ai"))
    band = estimated_band(correct, thresholds, total) if full_mock else None
    return {
        "test_id": test.get("id"),
        "result_type": "estimated_practice_result",
        "raw_score": correct,
        "total_questions": total,
        "out_of": total,
        "correct": correct,
        "incorrect": total - correct - unanswered,
        "unanswered": unanswered,
        "estimated_band": band,
        "label": "Estimated practice band" if full_mock else "Practice score (not a full-test band)",
        "score_note": "Band comes from correct answers only, using the standard IELTS Listening conversion. Practice estimate — not an official IELTS result.",
        "conversion_table": conversion_table(),
        "question_type_breakdown": breakdown,
        "details": details,
        "generated_by_ai": generated,
        "graded_by": "answer_key",
    }


def student_safe_question(question: dict) -> dict:
    return {k: v for k, v in question.items() if k not in QUESTION_HIDDEN}


def student_safe_part(part: dict) -> dict:
    safe = {k: v for k, v in part.items() if k not in PART_HIDDEN}
    audio = str(safe.get("audio_asset") or "").split("/")[-1]
    visual = str(safe.get("visual_asset") or "").split("/")[-1]
    if audio:
        safe["audio_file"] = audio
    if visual:
        safe["visual_file"] = visual
    return safe


def student_safe_test(test: dict) -> dict:
    return {
        "id": test.get("id"),
        "title": test.get("title"),
        "duration_minutes": test.get("duration_minutes"),
        "part_count": len(test.get("parts") or []),
        "question_count": len(test.get("questions") or []),
        "audio_status": test.get("audio_status"),
        "generated_by_ai": bool(test.get("generated_by_ai")),
        "instructions": test.get("instructions")
        or [
            "Original IELTS-style practice — not official IELTS material.",
            "Answers and transcripts stay hidden until you submit.",
        ],
        "parts": [student_safe_part(p) for p in test.get("parts") or []],
        "questions": [student_safe_question(q) for q in test.get("questions") or []],
    }
