"""Writing module helpers: word count, bands, visual validation, duplicates."""
from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any, Optional

from pathlib import Path

from app.config import settings

CHART_TYPES = {"line_graph", "bar_chart", "pie_chart", "table", "mixed_chart"}
MAP_TYPES = {"map"}
PROCESS_TYPES = {"process"}
LETTER_TYPES = {"formal_letter", "semi_formal_letter", "informal_letter"}
ESSAY_TYPES = {
    "agree_disagree",
    "opinion",
    "discuss_both_views",
    "advantages_disadvantages",
    "problem_solution",
    "causes_solutions",
    "two_part",
    "positive_negative",
    "mixed_other",
}

ACADEMIC_TASK1_TYPES = [
    "line_graph",
    "bar_chart",
    "pie_chart",
    "table",
    "map",
    "process",
    "mixed_chart",
]


def count_words(text: Optional[str]) -> int:
    if not text:
        return 0
    return len(re.findall(r"[A-Za-z0-9']+", text))


def script_attempt_kind(text: Optional[str]) -> str:
    """empty | non_attempt | attempt — used to stop gibberish getting a practice band."""
    raw = unicodedata.normalize("NFKC", str(text or "")).strip()
    if not raw:
        return "empty"
    tokens = re.findall(r"[A-Za-z0-9']+", raw)
    if not tokens:
        return "empty"
    words = [token.lower() for token in tokens]
    n = len(words)
    unique = set(words)
    letters = "".join(ch for ch in raw.lower() if ch.isalpha())
    vowel_ratio = (sum(ch in "aeiou" for ch in letters) / len(letters)) if letters else 0.0
    function_hits = sum(1 for word in words if word in _FUNCTION_WORDS)
    single_letter = sum(1 for word in words if len(word) == 1)
    longest_repeat = max(words.count(word) for word in unique) / n
    content_words = [word for word in unique if len(word) >= 3]

    if n < 3:
        return "non_attempt"
    if function_hits == 0 and n < 40 and (
        single_letter / n >= 0.35 or vowel_ratio < 0.22 or longest_repeat >= 0.45 or len(content_words) <= 2
    ):
        return "non_attempt"
    if function_hits <= 1 and n < 25 and (vowel_ratio < 0.28 or longest_repeat >= 0.4):
        return "non_attempt"
    return "attempt"


def non_attempt_grading(*, task_number: int, test_type: str, minimum_words: int, word_count: int, kind: str) -> dict:
    if kind == "empty":
        why = [
            "No answer was written, so this cannot be marked as an IELTS Writing task.",
            "IELTS awards band 0 when the candidate does not attempt the task.",
        ]
        explanation = "Band 0: the script is empty, so there is nothing to assess."
    else:
        why = [
            f"The text ({word_count} tokens) is not a meaningful English response — it looks like random letters or repeated keystrokes.",
            "IELTS Writing band 0 is for scripts that do not attempt the task in English.",
            f"A real Task {task_number} answer needs connected sentences and at least {minimum_words} words.",
        ]
        explanation = "Band 0: this is not an English attempt at the task, so no practice band above 0 is given."
    zero = {"band": 0.0, "feedback": "There is no assessable English in this script."}
    parsed = {
        "estimated_overall_band": 0.0,
        "criteria": {
            "task_response_or_achievement": dict(zero),
            "coherence_and_cohesion": dict(zero),
            "lexical_resource": dict(zero),
            "grammatical_range_and_accuracy": dict(zero),
        },
        "strengths": [],
        "priority_improvements": ["Write a real answer in English that addresses the question."],
        "grammar_errors": [],
        "vocabulary_feedback": [],
        "structure_feedback": "There is no paragraph structure to assess.",
        "task_specific_feedback": "The task was not attempted in English.",
        "next_steps": [
            "Type full English sentences about the question — not random letters.",
            f"Aim for at least {minimum_words} words with an introduction, body, and ending.",
        ],
        "why_this_band": why,
        "non_attempt": True,
        "estimated_band_explanation": explanation,
        "practice_recommendation": "On the next try, write full sentences about the chart, letter, or essay question.",
        "task_number": task_number,
    }
    return attach_practice_feedback(
        parsed,
        task_number=task_number,
        test_type=test_type,
        minimum_words=minimum_words,
        word_count=word_count,
    )


def round_half_band(value: float) -> float:
    return round(value * 2) / 2.0


def overall_writing_band(task1_band: float, task2_band: float) -> float:
    """IELTS Writing weighting: Task 2 is worth twice Task 1."""
    raw = (float(task1_band) + 2.0 * float(task2_band)) / 3.0
    return round_half_band(raw)


def normalize_prompt(text: str) -> str:
    lowered = (text or "").lower()
    lowered = re.sub(r"\d+", "0", lowered)
    lowered = re.sub(r"[^a-z\s]", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_prompt(a), normalize_prompt(b)).ratio()


def is_duplicate_prompt(a: str, b: str, threshold: Optional[float] = None) -> bool:
    thresh = threshold if threshold is not None else settings.WRITING_DUPLICATE_THRESHOLD
    return similarity(a, b) >= thresh


def parse_json_maybe(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return None
    return None


def _numbers(seq) -> list[float]:
    out = []
    for item in seq:
        if isinstance(item, bool) or not isinstance(item, (int, float)):
            raise ValueError("Chart values must be numeric.")
        out.append(float(item))
    return out


def validate_visual_data(question_type: str, visual_data: Any) -> tuple[bool, str, Optional[dict]]:
    if isinstance(visual_data, dict) and visual_data.get("image_only"):
        return True, "", visual_data
    if question_type in LETTER_TYPES or question_type in ESSAY_TYPES:
        return True, "", visual_data if isinstance(visual_data, dict) else None

    if not visual_data:
        if question_type in CHART_TYPES | MAP_TYPES | PROCESS_TYPES:
            return False, "Visual data is required for this question type.", None
        return True, "", None

    if isinstance(visual_data, str):
        visual_data = parse_json_maybe(visual_data)
        if visual_data is None:
            return False, "visual_data is not valid JSON.", None

    if not isinstance(visual_data, dict):
        return False, "visual_data must be an object.", None

    data = dict(visual_data)
    data.setdefault("type", question_type)

    try:
        if question_type in {"line_graph", "bar_chart", "table"}:
            _validate_series_chart(data)
        elif question_type == "pie_chart":
            _validate_pie(data)
        elif question_type == "mixed_chart":
            _validate_mixed(data)
        elif question_type == "process":
            _validate_process(data)
        elif question_type == "map":
            _validate_map(data)
    except ValueError as exc:
        return False, str(exc), None

    return True, "", data


def _validate_series_chart(data: dict) -> None:
    series = data.get("series")
    if not isinstance(series, dict) or not series:
        raise ValueError("Chart series must be a non-empty object of category → values.")
    years = data.get("years") or data.get("labels") or data.get("x_labels")
    if not years or not isinstance(years, list):
        raise ValueError("Chart needs years or labels.")
    cats = data.get("categories") or list(series.keys())
    if set(cats) != set(series.keys()) and data.get("categories"):
        # Allow categories that match series keys in order
        if list(series.keys()) != list(cats) and not set(series.keys()).issuperset(set(cats)):
            if len(cats) != len(next(iter(series.values()), [])):
                pass
    length = len(years)
    for key, values in series.items():
        if not isinstance(values, list):
            raise ValueError(f"Series '{key}' must be a list of numbers.")
        nums = _numbers(values)
        if len(nums) != length:
            raise ValueError(f"Series '{key}' length must match years/labels ({length}).")
        data["series"][key] = nums


def _validate_pie(data: dict) -> None:
    charts = data.get("charts")
    categories = data.get("categories")
    if charts:
        if not isinstance(charts, list) or not charts:
            raise ValueError("Pie charts list is empty.")
        for chart in charts:
            values = _numbers(chart.get("values") or [])
            if categories and len(values) != len(categories):
                raise ValueError("Pie values must match categories.")
            chart["values"] = values
        return
    series = data.get("series")
    if isinstance(series, dict):
        data["categories"] = list(series.keys())
        data["charts"] = [{"label": data.get("title") or "Share", "values": _numbers(series.values())}]
        return
    values = data.get("values")
    if values:
        data["charts"] = [{"label": data.get("title") or "Share", "values": _numbers(values)}]
        return
    raise ValueError("Pie chart needs charts, series, or values.")


def _validate_mixed(data: dict) -> None:
    if not data.get("bar_chart") and not data.get("line_graph"):
        raise ValueError("Mixed chart needs bar_chart and/or line_graph.")
    years = data.get("years")
    if years and not isinstance(years, list):
        raise ValueError("Mixed chart years must be a list.")
    for key in ("bar_chart", "line_graph"):
        part = data.get(key)
        if not part:
            continue
        if not isinstance(part, dict) or not isinstance(part.get("series"), dict):
            raise ValueError(f"{key} must include a series object.")
        length = len(years or [])
        for name, values in part["series"].items():
            nums = _numbers(values)
            if length and len(nums) != length:
                raise ValueError(f"{key} series '{name}' length must match years.")
            part["series"][name] = nums


def _validate_process(data: dict) -> None:
    stages = data.get("stages")
    if not stages or not isinstance(stages, list):
        raise ValueError("Process visual needs a stages list.")
    normalized = []
    for i, stage in enumerate(stages, start=1):
        if isinstance(stage, str):
            normalized.append({"step": i, "label": stage})
        elif isinstance(stage, dict) and stage.get("label"):
            normalized.append({"step": stage.get("step", i), "label": str(stage["label"])})
        else:
            raise ValueError("Each process stage needs a label.")
    data["stages"] = normalized
    data["type"] = "process"


def _validate_map(data: dict) -> None:
    if not data.get("title") and not data.get("changes") and not data.get("before"):
        raise ValueError("Map visual needs title, changes, or before/after landmarks.")
    data.setdefault("type", "map")
    data.setdefault("changes", data.get("changes") or [])
    data.setdefault("before", data.get("before") or data.get("before_state") or {})
    data.setdefault("after", data.get("after") or data.get("after_state") or {})
    data.setdefault("landmarks", data.get("landmarks") or [])
    data.setdefault("added", data.get("added") or data.get("added_items") or [])
    data.setdefault("removed", data.get("removed") or data.get("removed_items") or [])
    data.setdefault("relocated", data.get("relocated") or data.get("relocated_items") or [])


def resolve_writing_file(path: Optional[str]) -> Optional[Path]:
    if not path:
        return None
    raw = Path(path)
    root = Path(settings.WRITING_PACKS_DIR).resolve().parent.parent
    candidates = [raw, root / path, Path(settings.WRITING_PACKS_DIR) / path, Path(settings.WRITING_IMAGE_DIR) / Path(path).name]
    for candidate in candidates:
        try:
            resolved = candidate.resolve() if not candidate.is_absolute() else candidate
        except OSError:
            continue
        if resolved.is_file():
            return resolved
    return None


def public_question_dict(q, extra: Optional[dict] = None, include_teacher: bool = False) -> dict:
    visual = q.visual_data
    extra_count = len((visual or {}).get("extra_images") or []) if isinstance(visual, dict) else 0
    payload = {
        "id": q.id,
        "public_id": q.public_id,
        "test_type": q.test_type,
        "task_number": q.task_number,
        "question_type": q.question_type,
        "topic": q.topic,
        "difficulty": q.difficulty,
        "title": q.title,
        "prompt": q.prompt,
        "instructions": q.instructions,
        "minimum_words": q.minimum_words,
        "recommended_minutes": q.recommended_minutes,
        "visual_data": visual,
        "image_url": f"/api/writing/images/{q.id}" if q.image_path else None,
        "extra_image_urls": [f"/api/writing/images/{q.id}?n={i + 1}" for i in range(extra_count)],
        "book_id": getattr(q, "book_id", None),
        "book_title": getattr(q, "book_title", None),
        "test_number": getattr(q, "test_number", None),
        "pack_test_id": getattr(q, "pack_test_id", None),
        "letter_tone": q.letter_tone,
        "recipient": q.recipient,
        "bullet_points": q.bullet_points,
        "planning_tags": q.planning_tags,
        "source_type": q.source_type,
        "generated_by_ai": bool(q.generated_by_ai),
        "status": q.status,
        "is_permanent_bank": bool(q.is_permanent_bank),
        "duplicate_flag": bool(q.duplicate_flag),
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }
    if include_teacher:
        payload.update(
            {
                "source_reference": q.source_reference,
                "teacher_notes": q.teacher_notes,
                "reviewed_by": q.reviewed_by,
                "generated_by": q.generated_by,
                "image_path": q.image_path,
            }
        )
    if extra:
        payload.update(extra)
    return payload


VALID_BANDS = {i / 2 for i in range(0, 19)}  # 0.0 .. 9.0
_CHAR_COUNT = re.compile(r"\b(\d+)\s+characters?\b", re.I)
_FUNCTION_WORDS = {
    "the", "a", "an", "and", "of", "to", "in", "is", "was", "for", "that", "it",
    "on", "as", "with", "this", "are", "be", "by", "from", "or", "at", "which",
    "have", "has", "had", "not", "but", "they", "their", "there", "were", "been",
    "chart", "graph", "table", "map", "letter", "people", "show", "shows", "shown",
}


def coerce_band(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        band = float(value)
    except (TypeError, ValueError):
        raise ValueError("Band scores must be numeric.")
    if band < 0 or band > 9:
        raise ValueError("Band scores must be between 0 and 9.")
    return round_half_band(band)


def validate_grading_payload(data: dict, task_number: int) -> dict:
    if not isinstance(data, dict):
        raise ValueError("Grading response must be a JSON object.")
    criteria = data.get("criteria") or {}
    if not isinstance(criteria, dict):
        raise ValueError("criteria must be an object.")

    required_keys = [
        "task_response_or_achievement",
        "coherence_and_cohesion",
        "lexical_resource",
        "grammatical_range_and_accuracy",
    ]
    for key in required_keys:
        block = criteria.get(key) or {}
        if not isinstance(block, dict):
            raise ValueError(f"Missing criterion: {key}")
        band = coerce_band(block.get("band"))
        if band is None:
            raise ValueError(f"Missing band for {key}")
        block["band"] = band
        block["feedback"] = str(block.get("feedback") or "")
        criteria[key] = block

    overall = coerce_band(data.get("estimated_overall_band"))
    if overall is None:
        scores = [criteria[k]["band"] for k in required_keys]
        overall = round_half_band(sum(scores) / 4.0)

    grammar_errors = data.get("grammar_errors") or []
    cleaned_errors = []
    for item in grammar_errors:
        if not isinstance(item, dict):
            continue
        cleaned_errors.append(
            {
                "original": str(item.get("original") or ""),
                "suggested": str(item.get("suggested") or item.get("correction") or ""),
                "category": str(item.get("category") or "grammar"),
                "explanation": str(item.get("explanation") or ""),
            }
        )

    vocab = data.get("vocabulary_feedback") or []
    if isinstance(vocab, str):
        vocab = [vocab]

    why = [
        str(item).strip()
        for item in (data.get("why_this_band") or data.get("reasons") or [])
        if str(item).strip()
    ]

    return {
        "estimated_overall_band": overall,
        "criteria": criteria,
        "strengths": [str(s).strip() for s in (data.get("strengths") or []) if str(s).strip()],
        "priority_improvements": [
            str(s).strip()
            for s in (data.get("priority_improvements") or data.get("main_problems") or [])
            if str(s).strip()
        ],
        "grammar_errors": cleaned_errors,
        "vocabulary_feedback": vocab,
        "structure_feedback": str(data.get("structure_feedback") or ""),
        "task_specific_feedback": str(data.get("task_specific_feedback") or ""),
        "next_steps": [str(s).strip() for s in (data.get("next_steps") or []) if str(s).strip()],
        "why_this_band": why,
        "estimated_band_explanation": str(data.get("estimated_band_explanation") or ""),
        "practice_recommendation": str(data.get("practice_recommendation") or ""),
        "task_number": task_number,
    }


def _fix_count_language(text: str, word_count: int, minimum_words: int) -> str:
    def repl(match: re.Match[str]) -> str:
        n = int(match.group(1))
        if n in {word_count, minimum_words}:
            return f"{n} words"
        return match.group(0)

    return _CHAR_COUNT.sub(repl, text)


def attach_practice_feedback(
    parsed: dict,
    *,
    task_number: int,
    test_type: str,
    minimum_words: int,
    word_count: int,
) -> dict:
    """Fill why-this-band and next-step gaps with evidence from this script."""
    data = dict(parsed)

    def fix(value: str) -> str:
        return _fix_count_language(value, word_count, minimum_words)

    why = [fix(str(item).strip()) for item in (data.get("why_this_band") or []) if str(item).strip()]
    below = word_count < minimum_words
    non_attempt = bool(data.get("non_attempt"))
    accurate = (
        f"You wrote {word_count} words; Task {task_number} needs at least {minimum_words}. "
        "Short answers lose Task Achievement/Response marks."
    )
    if (
        below
        and not non_attempt
        and not any(f"{word_count} words" in item and str(minimum_words) in item for item in why)
    ):
        why.insert(0, accurate)
    explanation = fix((data.get("estimated_band_explanation") or "").strip())
    if not why and explanation:
        why.append(explanation)
    ta = fix(((data.get("criteria") or {}).get("task_response_or_achievement") or {}).get("feedback") or "")
    if ta.strip() and not any(ta.strip()[:40].lower() in item.lower() for item in why):
        why.append(ta.strip())
    task_fb = fix((data.get("task_specific_feedback") or "").strip())
    if task_fb and not any(task_fb[:40].lower() in item.lower() for item in why):
        why.append(task_fb)
    data["why_this_band"] = why[:6]
    data["estimated_band_explanation"] = explanation or (why[0] if why else "")

    suggestions = [fix(str(s).strip()) for s in (data.get("next_steps") or []) if str(s).strip()]
    improvements = [fix(str(s).strip()) for s in (data.get("priority_improvements") or []) if str(s).strip()]
    length_tip = any("word" in s.lower() or "minimum" in s.lower() for s in suggestions + improvements)
    if below and not non_attempt and not length_tip:
        suggestions.insert(0, f"Write at least {minimum_words} words before you submit.")
        if task_number == 1 and test_type == "academic":
            suggestions.append("Open with an overview of the main trend, then compare 2–3 key figures from the visual.")
        elif task_number == 1:
            suggestions.append("Cover every bullet in a clear letter and keep the right tone from start to finish.")
        else:
            suggestions.append("State your position in the introduction, then develop it with two body paragraphs and a conclusion.")
    data["next_steps"] = suggestions[:6]
    data["priority_improvements"] = improvements[:6]
    data["structure_feedback"] = fix(str(data.get("structure_feedback") or ""))
    data["task_specific_feedback"] = fix(str(data.get("task_specific_feedback") or ""))
    data["practice_recommendation"] = fix(str(data.get("practice_recommendation") or ""))
    criteria = data.get("criteria") or {}
    for key, block in list(criteria.items()):
        if isinstance(block, dict) and block.get("feedback"):
            block = dict(block)
            block["feedback"] = fix(str(block.get("feedback") or ""))
            criteria[key] = block
    data["criteria"] = criteria
    data["word_count"] = word_count
    data["minimum_words"] = minimum_words
    data["below_minimum"] = below
    data["non_attempt"] = non_attempt
    return data
