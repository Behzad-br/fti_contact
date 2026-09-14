"""
Per-question examiner notes: quote what the candidate said and why marks dropped.
"""
from __future__ import annotations

from collections import Counter
from typing import Optional

from app.speaking.services.relevance import score_relevance
from app.speaking.services.speech_quality import content_words, extract_corrections, tokenize

_EXPECTED_WORDS = {1: 30, 2: 120, 3: 40}
_EXPECTED_SECONDS = {1: 20, 2: 90, 3: 25}


def _quote(text: str, limit: int = 90) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def _trigram_repeat(words: list[str]) -> Optional[tuple[str, int]]:
    if len(words) < 6:
        return None
    grams = [" ".join(words[i : i + 3]) for i in range(len(words) - 2)]
    phrase, count = Counter(grams).most_common(1)[0]
    if count >= 2:
        return phrase, count
    return None


def review_answer(
    question_text: str,
    transcript: str,
    part: int = 1,
    duration: Optional[float] = None,
    extra: Optional[str] = None,
    relevance: Optional[dict] = None,
) -> dict:
    part = int(part or 1)
    text = (transcript or "").strip()
    words = tokenize(text)
    content = content_words(text)
    rel = relevance or score_relevance(question_text, text, extra)
    uniq = (len(set(words)) / len(words)) if words else 0.0
    expected_w = _EXPECTED_WORDS.get(part, 30)
    expected_s = _EXPECTED_SECONDS.get(part, 20)
    duration = float(duration or 0)
    cuts: list[str] = []
    issues = extract_corrections(text, limit=4)

    band = 5.0  # modest start; real IELTS 6 needs developed, accurate speech

    if not content:
        return {
            "answer_band": 1.0,
            "mark_cuts": ["No clear English was captured for this question, so this answer scores Band 1."],
            "issues": [],
            "examiner_note": "The examiner heard almost nothing that can be marked.",
            "relevance_label": rel.get("label"),
            "relevance_score": rel.get("score"),
            "relevance_note": rel.get("note"),
        }

    label = rel.get("label")
    if label == "off_topic":
        band = min(band, 3.5)
        cuts.append(
            f'You said “{_quote(text)}” but the question was “{question_text}”. '
            "Off-topic talk cannot raise Fluency or Vocabulary."
        )
    elif label == "partly":
        band = min(band, 4.5)
        cuts.append(
            f"This only partly answers the question. You said “{_quote(text, 70)}”. "
            "Give a direct answer, then a reason and an example."
        )
    elif label == "no_speech":
        band = 1.0
        cuts.append("No answer was recorded.")

    if len(content) < expected_w * 0.45:
        band -= 1.0
        cuts.append(
            f"Too short for Part {part}: {len(content)} content words "
            f"(aim for about {expected_w}+). Short answers cap Fluency."
        )
    elif len(content) < expected_w:
        band -= 0.5
        cuts.append(
            f"Under-developed for Part {part}: {len(content)} content words; IELTS expects about {expected_w}+."
        )

    if duration and duration < expected_s * 0.5:
        band -= 0.5
        cuts.append(
            f"Speaking time was only {duration:.0f}s. Part {part} needs about {expected_s}s of talk."
        )

    if uniq < 0.4 and len(words) >= 8:
        common, n = Counter(words).most_common(1)[0]
        band -= 1.0
        cuts.append(
            f'Vocabulary is looping — “{common}” appeared {n} times. '
            "Repeating the same words lowers Lexical Resource."
        )
    elif uniq < 0.5 and len(words) >= 8:
        band -= 0.5
        cuts.append("Word choice is repetitive. Use more precise topic vocabulary.")

    repeated = _trigram_repeat(words)
    if repeated:
        phrase, n = repeated
        band -= 0.5
        cuts.append(f'You repeated “{phrase}” {n} times. That hurts Fluency & Coherence.')

    if issues:
        band -= 0.5 if len(issues) == 1 else 1.0
        for item in issues:
            cuts.append(
                f'Grammar: you said “{item["original"]}” → say “{item["better"]}”. '
                "This lowers Grammatical Range and Accuracy."
            )

    if label == "on_topic" and len(content) >= expected_w and uniq >= 0.5:
        band += 0.5
    if label == "on_topic" and duration >= expected_s and uniq >= 0.52:
        band += 0.5

    band = round(max(1.0, min(6.5, band)) * 2) / 2
    if not cuts:
        cuts.append(
            "This answer stayed on the question, but keep extending with a reason and a concrete example for a higher band."
        )

    note = cuts[0]
    return {
        "answer_band": band,
        "mark_cuts": cuts[:5],
        "issues": issues,
        "examiner_note": note,
        "relevance_label": label,
        "relevance_score": rel.get("score"),
        "relevance_note": rel.get("note"),
    }


def review_session(qa_pairs: list, per_relevance: Optional[list] = None) -> dict:
    items = []
    weighted = []
    for i, item in enumerate(qa_pairs):
        extra = item.get("cue_card_topic") or ""
        bullets = item.get("cue_card_bullets") or []
        if isinstance(bullets, list):
            extra = extra + " " + " ".join(str(b) for b in bullets)
        rel = per_relevance[i] if per_relevance and i < len(per_relevance) else None
        review = review_answer(
            item.get("question_text") or "",
            item.get("transcript") or "",
            part=int(item.get("part") or 1),
            duration=item.get("duration"),
            extra=extra,
            relevance=rel,
        )
        items.append(review)
        weight = 2.0 if int(item.get("part") or 1) == 2 else 1.0
        weighted.append((review["answer_band"], weight))

    if weighted:
        total_w = sum(w for _, w in weighted)
        mean = sum(b * w for b, w in weighted) / total_w
    else:
        mean = 1.0
    return {
        "items": items,
        "weighted_band": round(mean * 2) / 2,
    }


def cap_result_to_answers(result: dict, reviews: dict) -> dict:
    """Overall band cannot sit far above what each answer actually earned."""
    cap = float(reviews.get("weighted_band") or 4.0)

    def half(v: float) -> float:
        return round(max(1.0, min(9.0, v)) * 2) / 2

    for key in ("fluency_coherence", "lexical_resource", "grammar", "estimated_band"):
        if result.get(key) is not None:
            result[key] = half(min(float(result[key]), cap))
    return result
