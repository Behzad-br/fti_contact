"""Reading scoring — matches pack result-engine.mjs."""
from __future__ import annotations

import re
import unicodedata


SERVER_ONLY_FIELDS = {
    "answer",
    "answer_text",
    "accepted_answers",
    "evidence",
    "source_locator",
    "explanation",
}


def normalize_answer(value) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    text = "".join(ch if ch.isalnum() else " " for ch in text)
    return re.sub(r"\s+", " ", text).strip()


def estimated_band(raw_score: int, thresholds: list[dict]) -> float:
    if raw_score <= 0:
        return 0.0
    rows = sorted(thresholds, key=lambda r: r["min_raw"], reverse=True)
    for row in rows:
        if raw_score >= int(row["min_raw"]):
            return float(row["band"])
    return 0.0


_TFNG_ALIASES = {
    "true": {"true", "t"},
    "false": {"false", "f"},
    "not given": {"not given", "ng", "n g", "notgiven"},
    "yes": {"yes", "y"},
    "no": {"no", "n"},
}


def _choice_letters(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if re.fullmatch(r"(?i)[a-g](?:\s*[,/&;]\s*[a-g])+", text) or re.fullmatch(r"(?i)[a-g]{2,4}$", text):
        return "".join(sorted(re.findall(r"[a-g]", text.lower())))
    return None


def is_correct(question: dict, submitted: str) -> bool:
    accepted = question.get("accepted_answers") or []
    target = normalize_answer(submitted)
    if any(normalize_answer(ans) == target for ans in accepted):
        return True
    qtype = question.get("type") or ""
    if qtype == "true_false_not_given":
        alias_keys = ("true", "false", "not given")
    elif qtype == "yes_no_not_given":
        alias_keys = ("yes", "no", "not given")
    else:
        alias_keys = ()
    for ans in accepted:
        key = normalize_answer(ans)
        for canonical in alias_keys:
            group = _TFNG_ALIASES[canonical]
            if key == canonical or key in group:
                if target == canonical or target in group:
                    return True
    submitted_letters = _choice_letters(submitted)
    if submitted_letters:
        return any(_choice_letters(ans) == submitted_letters for ans in accepted)
    return False


def grade_attempt(test: dict, responses: dict, thresholds: list[dict]) -> dict:
    details = []
    for question in test.get("questions") or []:
        number = str(question.get("number"))
        submitted = responses.get(number) or responses.get(question.get("id")) or ""
        unanswered = normalize_answer(submitted) == ""
        correct = False if unanswered else is_correct(question, submitted)
        details.append(
            {
                "question_id": question.get("id"),
                "question_number": question.get("number"),
                "question_type": question.get("type"),
                "prompt": question.get("prompt"),
                "submitted_answer": submitted,
                "correct": correct,
                "unanswered": unanswered,
                "correct_answer": question.get("answer"),
                "correct_answer_text": question.get("answer_text") or question.get("answer"),
                "evidence": question.get("evidence"),
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
    return {
        "test_id": test.get("id"),
        "test_type": test.get("test_type"),
        "result_type": "estimated_practice_result",
        "raw_score": correct,
        "total_questions": total,
        "correct": correct,
        "incorrect": total - correct - unanswered,
        "unanswered": unanswered,
        "estimated_band": estimated_band(correct, thresholds) if full_mock else None,
        "label": "Estimated practice band" if full_mock else "Practice score (not a full-test band)",
        "generated_by_ai": bool(test.get("generated_by_ai")),
        "question_type_breakdown": breakdown,
        "details": details,
    }


_WORD_NUMBERS = {
    "ONE": 1,
    "TWO": 2,
    "THREE": 3,
    "FOUR": 4,
    "FIVE": 5,
    "SIX": 6,
    "SEVEN": 7,
    "EIGHT": 8,
    "NINE": 9,
    "TEN": 10,
}


def word_limit_from_instruction(instruction: str | None) -> int | None:
    match = re.search(r"NO MORE THAN (\w+) WORD", instruction or "", re.I)
    if not match:
        return None
    token = match.group(1).upper()
    if token.isdigit():
        return int(token)
    return _WORD_NUMBERS.get(token)


def student_safe_question(question: dict) -> dict:
    keep = (
        "id",
        "number",
        "passage_id",
        "type",
        "instruction",
        "prompt",
        "options",
        "visual_asset",
        "word_limit",
        "images",
    )
    safe = {k: question.get(k) for k in keep if question.get(k) is not None}
    limit = word_limit_from_instruction(question.get("instruction"))
    if limit:
        safe["word_limit"] = limit
    return safe


def student_safe_passage(passage: dict) -> dict:
    paragraphs = []
    for para in passage.get("paragraphs") or []:
        paragraphs.append(
            {
                "label": para.get("label"),
                "heading": para.get("heading"),
                "text": para.get("text"),
            }
        )
    payload = {
        "id": passage.get("id"),
        "title": passage.get("title"),
        "genre": passage.get("genre"),
        "paragraphs": paragraphs,
        "diagram_asset": passage.get("diagram_asset"),
    }
    if passage.get("images"):
        payload["images"] = list(passage.get("images") or [])
    return payload


def student_safe_test(test: dict) -> dict:
    return {
        "id": test.get("id"),
        "title": test.get("title"),
        "test_type": test.get("test_type"),
        "duration_minutes": test.get("duration_minutes"),
        "passage_count": test.get("passage_count"),
        "question_count": len(test.get("questions") or []),
        "instructions": test.get("instructions") or [],
        "generated_by_ai": bool(test.get("generated_by_ai")),
        "passages": [student_safe_passage(p) for p in test.get("passages") or []],
        "questions": [student_safe_question(q) for q in test.get("questions") or []],
    }
