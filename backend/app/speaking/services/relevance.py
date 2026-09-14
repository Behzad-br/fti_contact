"""
relevance.py — Check that a spoken answer actually addresses THIS question.

Used on submit (block clearly off-topic answers) and on final scoring.
"""
from __future__ import annotations

import re
from typing import Optional

from app.speaking.services.speech_quality import content_words, tokenize

_STOP = {
    "a", "an", "the", "and", "or", "but", "if", "so", "to", "of", "in", "on", "at",
    "for", "from", "with", "about", "as", "by", "is", "are", "was", "were", "be",
    "been", "being", "do", "does", "did", "have", "has", "had", "will", "would",
    "can", "could", "should", "may", "might", "you", "your", "yours", "i", "me",
    "my", "we", "our", "they", "their", "it", "its", "this", "that", "these",
    "those", "what", "which", "who", "whom", "whose", "when", "where", "why",
    "how", "please", "describe", "tell", "explain", "discuss", "think", "like",
    "also", "very", "really", "just", "not", "no", "yes", "some", "any", "more",
    "most", "other", "than", "then", "too", "into", "over", "after", "before",
}

# Related vocabulary so "Where did you grow up?" matches "I was born in Lahore".
_FAMILIES: dict[str, set[str]] = {
    "grow": {"grew", "grown", "childhood", "child", "children", "kid", "young",
             "hometown", "born", "raised", "upbringing", "memory", "memories"},
    "child": {"childhood", "children", "kid", "kids", "young", "grow", "grew",
              "parent", "parents", "school", "play", "toy", "memory"},
    "work": {"job", "jobs", "career", "office", "employ", "employee", "employer",
             "profession", "salary", "colleague", "company", "business"},
    "job": {"work", "career", "office", "employ", "profession", "salary"},
    "health": {"healthy", "wellbeing", "well-being", "fitness", "exercise", "diet",
               "doctor", "hospital", "illness", "stress", "mental", "physical"},
    "employ": {"employer", "employee", "employment", "job", "work", "company",
               "workplace", "boss", "staff"},
    "travel": {"trip", "trips", "journey", "holiday", "vacation", "tourist",
               "tourism", "abroad", "flight", "hotel", "visit", "visited"},
    "tech": {"technology", "phone", "smartphone", "internet", "computer", "app",
             "digital", "online", "ai", "social", "media"},
    "educat": {"education", "school", "university", "student", "teacher", "learn",
               "learning", "study", "studies", "class", "lesson"},
    "food": {"eat", "eating", "cook", "cooking", "meal", "restaurant", "diet",
             "dish", "cuisine", "taste"},
    "friend": {"friends", "friendship", "relationship", "relationships", "social",
               "people", "companion"},
    "art": {"arts", "culture", "music", "film", "movie", "museum", "painting",
            "creative", "artist"},
    "nature": {"environment", "environmental", "pollution", "climate", "green",
               "animal", "animals", "tree", "park"},
    "home": {"house", "hometown", "city", "village", "neighbour", "neighborhood",
             "live", "lived", "living", "flat", "apartment"},
}

_WHERE_CUES = {
    "in", "at", "from", "city", "town", "village", "country", "hometown",
    "born", "live", "lived", "living", "place", "area", "street",
}
_WHEN_CUES = {
    "when", "ago", "year", "years", "month", "day", "childhood", "young",
    "teenager", "once", "then", "before", "after", "recently",
}
_WHY_CUES = {
    "because", "cause", "reason", "so", "therefore", "since", "that's why",
}
_FREQ_CUES = {
    "always", "usually", "often", "sometimes", "rarely", "never", "every",
    "daily", "week", "weekend",
}


def _stem(word: str) -> str:
    w = word.lower()
    for suf in ("ing", "ers", "ies", "ied", "tion", "ment", "ness", "ful", "ous", "ed", "es", "s"):
        if len(w) > len(suf) + 3 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def _expand(word: str) -> set[str]:
    w = word.lower()
    out = {w, _stem(w)}
    for seed, related in _FAMILIES.items():
        if w == seed or w.startswith(seed) or seed.startswith(w[:4] if len(w) >= 4 else w):
            out |= related
            out.add(seed)
        if w in related:
            out |= related
            out.add(seed)
    return {x for x in out if len(x) > 2}


def question_focus(question_text: str, extra: Optional[str] = None) -> dict:
    raw = f"{question_text or ''} {extra or ''}".strip()
    q_lower = raw.lower()
    keywords = []
    for w in content_words(raw):
        if w in _STOP or len(w) < 3:
            continue
        keywords.append(w)
    expanded: set[str] = set()
    for w in keywords:
        expanded |= _expand(w)

    q_type = "general"
    if re.search(r"\bwhere\b", q_lower):
        q_type = "where"
    elif re.search(r"\bhow often\b|\bhow frequently\b", q_lower):
        q_type = "frequency"
    elif re.search(r"\bwhy\b|\bhow come\b", q_lower):
        q_type = "why"
    elif re.search(r"\bwhen\b", q_lower):
        q_type = "when"
    elif re.search(r"\bdescribe\b|\btalk about\b", q_lower):
        q_type = "describe"
    elif re.search(r"\bshould\b|\bdo you think\b|\bagree\b", q_lower):
        q_type = "opinion"

    return {"keywords": keywords, "expanded": expanded, "q_type": q_type, "text": raw}


def _english_ratio(text: str) -> float:
    letters = [c for c in (text or "") if c.isalpha()]
    if not letters:
        return 0.0
    ascii_letters = [c for c in letters if ord(c) < 128]
    return len(ascii_letters) / len(letters)


def _looks_like_gibberish(transcript: str, answer_words: list[str]) -> bool:
    if _english_ratio(transcript) < 0.75:
        return True
    if not answer_words:
        return True
    no_vowel = sum(1 for w in answer_words if len(w) > 3 and not re.search(r"[aeiou]", w))
    if no_vowel / len(answer_words) > 0.35:
        return True
    return False


def _word_matches_focus(word: str, expanded: set[str]) -> bool:
    stem = _stem(word)
    if word in expanded or stem in expanded:
        return True
    return any(len(e) >= 4 and (word.startswith(e[:4]) or e.startswith(stem[:4])) for e in expanded)


def _unique_topic_hits(answer_words: list[str], expanded: set[str]) -> set[str]:
    matched: set[str] = set()
    for w in answer_words:
        if _word_matches_focus(w, expanded):
            matched.add(_stem(w))
    return matched


def _keyword_hit_count(answer_words: list[str], keywords: list[str]) -> int:
    hits = 0
    for k in keywords[:8]:
        expanded = _expand(k)
        if any(_word_matches_focus(w, expanded) for w in answer_words):
            hits += 1
    return hits


def _unique_ratio(answer_words: list[str]) -> float:
    if not answer_words:
        return 0.0
    return len(set(answer_words)) / len(answer_words)


def score_relevance(question_text: str, transcript: str, extra: Optional[str] = None) -> dict:
    """
    Return 0–1 relevance plus a label.

    Strict IELTS-style check: repeating the question, looping the same phrase,
    or speaking English on a different topic must not count as a full answer.
    """
    focus = question_focus(question_text, extra)
    answer_words = [w for w in tokenize(transcript) if w not in _STOP]
    if not answer_words:
        return {
            "score": 0.0,
            "label": "no_speech",
            "note": "No answer to check against the question.",
            "matched": [],
        }

    if _looks_like_gibberish(transcript, answer_words):
        return {
            "score": 0.0,
            "label": "off_topic",
            "note": (
                "The recording is not clear English on this topic. "
                f"Speak about: {question_text}"
            ),
            "matched": focus["keywords"][:8],
            "q_type": focus["q_type"],
        }

    unique_hits = _unique_topic_hits(answer_words, focus["expanded"]) if focus["expanded"] else set()
    kw_hits = _keyword_hit_count(answer_words, focus["keywords"])
    uniq = _unique_ratio(answer_words)
    needed_kw = min(2, max(1, len(focus["keywords"][:6])))
    topic_score = (len(unique_hits) / max(len({_stem(w) for w in answer_words}), 1)) * 0.45
    keyword_score = min(1.0, kw_hits / needed_kw) * 0.45

    q_type = focus["q_type"]
    text = (transcript or "").lower()
    type_bonus = 0.0
    if q_type == "where" and any(c in answer_words or c in text.split() for c in _WHERE_CUES):
        type_bonus = 0.15
    elif q_type == "when" and any(c in answer_words for c in _WHEN_CUES):
        type_bonus = 0.15
    elif q_type == "why" and any(c in text for c in _WHY_CUES):
        type_bonus = 0.15
    elif q_type == "frequency" and any(c in answer_words for c in _FREQ_CUES):
        type_bonus = 0.15
    elif q_type == "opinion" and any(
        c in text for c in ("i think", "in my opinion", "should", "agree", "because")
    ):
        type_bonus = 0.1

    score = min(1.0, topic_score + keyword_score + type_bonus)
    if not focus["keywords"] and len(answer_words) >= 8:
        score = max(score, 0.7)

    # Echoing the question without adding an answer is not task achievement.
    # If the required topic words are present, repetition is a fluency issue, not off-topic.
    q_stems = {_stem(k) for k in focus["keywords"]}
    extra_words = [w for w in answer_words if _stem(w) not in q_stems]
    if (
        len(answer_words) >= 6
        and len(set(extra_words)) < 3
        and kw_hits
        and kw_hits < needed_kw
    ):
        score = min(score, 0.38)

    q_lower = (question_text or "").lower()
    if re.search(r"\bhow many\b|\bhow much\b|\bhours\b", q_lower):
        has_quantity = bool(
            re.search(
                r"\b\d+\b|once|twice|few|several|full.?time|part.?time|"
                r"\bhour|\bhours\b|\bweek|\bday|\bten\b|\btwenty\b|\bthirty\b|"
                r"\bforty\b|\bfifty\b|\bsixty\b",
                text,
            )
        )
        if not has_quantity:
            score = min(score, 0.4)

    if uniq < 0.35:
        score *= 0.45
    elif uniq < 0.5:
        score *= 0.7

    # One shared word (work/job) is not enough for a developed on-topic answer.
    if focus["keywords"] and kw_hits < needed_kw and len(unique_hits) < 2:
        score = min(score, 0.35)

    if score >= 0.62:
        label = "on_topic"
        note = "Answer addresses this question."
    elif score >= 0.38:
        label = "partly"
        note = "Some connection to the question, but the main point is weak, repetitive, or incomplete."
    else:
        label = "off_topic"
        note = (
            "This answer does not match the question that was asked. "
            f"Speak about: {question_text}"
        )

    return {
        "score": round(score, 2),
        "label": label,
        "note": note,
        "matched": focus["keywords"][:8],
        "q_type": q_type,
    }


def session_relevance(qa_pairs: list) -> dict:
    per = []
    scores = []
    off = 0
    for item in qa_pairs:
        extra = item.get("cue_card_topic") or ""
        bullets = item.get("cue_card_bullets") or []
        if isinstance(bullets, list):
            extra = extra + " " + " ".join(str(b) for b in bullets)
        rel = score_relevance(item.get("question_text") or "", item.get("transcript") or "", extra)
        per.append(rel)
        scores.append(rel["score"])
        if rel["label"] == "off_topic":
            off += 1
    avg = sum(scores) / len(scores) if scores else 0.0
    n = max(len(scores), 1)
    off_ratio = off / n
    band_raw = 3.0 + avg * 4.0 - off_ratio * 1.5
    band = round(max(1.0, min(9.0, band_raw)) * 2) / 2
    if off >= 4:
        band = min(band, 4.0)
    elif off >= 3:
        band = min(band, 4.5)
    if avg < 0.4:
        band = min(band, 4.0)
    return {
        "average": round(avg, 2),
        "off_topic_count": off,
        "per_answer": per,
        "band": band,
    }
