"""
speech_quality.py — Detect real spoken English vs silence / Whisper hallucinations.

Used both when accepting an answer and when scoring a finished test.
"""
import math
import re
import struct
import wave
from typing import Optional

# Whisper often invents these when the clip is silent or nearly silent.
_HALLUCINATIONS = {
    "you", "yeah", "yes", "no", "uh", "um", "ah", "oh", "hmm", "mm", "mhm",
    "okay", "ok", "bye", "hello", "hi", "thanks", "thank you", "thank you.",
    "thanks for watching", "subscribe", "music", "applause", "silence",
    "you.", "the", "a", "i", "it", ".", "...", "mbc", "subtitle", "subtitles",
}

_FILLER_ONLY = {
    "um", "uh", "er", "ah", "like", "you know", "i mean", "so", "well",
    "okay", "ok", "right", "yeah", "yes", "no",
}

_LINKERS = {
    "because", "however", "therefore", "although", "moreover", "besides",
    "for example", "for instance", "on the other hand", "in addition",
    "firstly", "secondly", "finally", "as a result",
}

_GRAMMAR_FIXES = [
    (r"\bi has\b", "I have"),
    (r"\bi goed\b", "I went"),
    (r"\bi have went\b", "I went"),
    (r"\bi have saw\b", "I have seen"),
    (r"\bshe don't\b", "she doesn't"),
    (r"\bhe don't\b", "he doesn't"),
    (r"\bit don't\b", "it doesn't"),
    (r"\bthey was\b", "they were"),
    (r"\bwe was\b", "we were"),
    (r"\bhe go\b", "he goes"),
    (r"\bshe go\b", "she goes"),
    (r"\bit go\b", "it goes"),
    (r"\bmore better\b", "better"),
    (r"\bdidn't went\b", "didn't go"),
    (r"\bdidn't saw\b", "didn't see"),
    (r"\bcan able to\b", "can"),
    (r"\bi am agree\b", "I agree"),
    (r"\bi am like\b", "I like"),
    (r"\bpeoples\b", "people"),
    (r"\binformations\b", "information"),
    (r"\bequipments\b", "equipment"),
]


def wav_rms(path: str) -> float:
    """RMS amplitude of a 16-bit WAV. Silence is typically well below 300."""
    try:
        with wave.open(path, "rb") as w:
            n = w.getnframes()
            if n <= 0:
                return 0.0
            frames = w.readframes(n)
            width = w.getsampwidth()
            if width != 2 or len(frames) < 2:
                return 0.0
            count = len(frames) // 2
            samples = struct.unpack("<" + ("h" * count), frames[: count * 2])
            return math.sqrt(sum(s * s for s in samples) / count)
    except Exception:
        return 0.0


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", (text or "").lower())


def content_words(text: str) -> list[str]:
    words = tokenize(text)
    return [w for w in words if w not in _FILLER_ONLY and w not in {"the", "a", "an"}]


def is_hallucination(transcript: str) -> bool:
    cleaned = re.sub(r"[^\w\s']", "", (transcript or "").strip().lower())
    if not cleaned:
        return True
    if cleaned in _HALLUCINATIONS:
        return True
    words = tokenize(cleaned)
    if not words:
        return True
    if len(words) <= 2 and all(
        w in _HALLUCINATIONS or w in _FILLER_ONLY for w in words
    ):
        return True
    return False


def speech_status(
    transcript: str,
    duration: Optional[float],
    part: int = 1,
    rms: Optional[float] = None,
    no_speech_prob: Optional[float] = None,
) -> dict:
    """
    Decide whether a clip contains a real IELTS-style answer.
    """
    text = (transcript or "").strip()
    words = content_words(text)
    duration = float(duration or 0)
    min_words = 15 if part == 2 else 8
    min_seconds = 12 if part == 2 else 4

    silent_audio = rms is not None and rms < 250
    whisper_silent = no_speech_prob is not None and no_speech_prob >= 0.6
    fake = is_hallucination(text)

    insufficient = (
        silent_audio
        or whisper_silent
        or fake
        or len(words) < min_words
        or duration < min_seconds
    )

    reason = ""
    if silent_audio or (not text) or fake:
        reason = (
            "No speech detected. Speak a full answer in English — "
            "at least a few sentences — then stop the recording."
        )
    elif duration < min_seconds:
        reason = (
            f"Recording too short ({duration:.0f}s). "
            f"Speak for at least {min_seconds} seconds."
        )
    elif len(words) < min_words:
        reason = (
            f"Answer too short ({len(words)} real words). "
            f"Give at least {min_words} words with a reason or example."
        )

    return {
        "insufficient": insufficient,
        "reason": reason,
        "content_word_count": len(words),
        "raw_word_count": len(tokenize(text)),
        "is_hallucination": fake,
    }


def analyze_session(qa_pairs: list) -> dict:
    """Aggregate real-speech evidence across a full mock test."""
    total_content = 0
    total_raw = 0
    total_duration = 0.0
    real_answers = 0
    empty_answers = 0
    part_content = {1: 0, 2: 0, 3: 0}
    texts = []
    per_item = []

    for item in qa_pairs:
        part = int(item.get("part") or 1)
        text = (item.get("transcript") or "").strip()
        duration = float(item.get("duration") or 0)
        status = speech_status(text, duration, part=part)
        total_content += status["content_word_count"]
        total_raw += status["raw_word_count"]
        total_duration += duration
        part_content[part] = part_content.get(part, 0) + status["content_word_count"]
        if status["insufficient"] or status["is_hallucination"] or not text:
            empty_answers += 1
        else:
            real_answers += 1
            texts.append(text)
        per_item.append({**item, "status": status, "text": text})

    joined = " ".join(texts)
    words = tokenize(joined)
    unique_ratio = (len(set(words)) / len(words)) if words else 0.0
    sentences = [s.strip() for s in re.split(r"[.!?]+", joined) if s.strip()]
    avg_sent = (sum(len(tokenize(s)) for s in sentences) / len(sentences)) if sentences else 0.0
    linker_count = sum(1 for link in _LINKERS if link in joined.lower())

    return {
        "total_content_words": total_content,
        "total_raw_words": total_raw,
        "total_duration": total_duration,
        "real_answers": real_answers,
        "empty_answers": empty_answers,
        "question_count": len(qa_pairs),
        "part_content": part_content,
        "unique_ratio": unique_ratio,
        "avg_sentence_len": avg_sent,
        "linker_count": linker_count,
        "joined": joined,
        "items": per_item,
        "insufficient_session": real_answers == 0 or total_content < 20,
    }


def extract_corrections(text: str, limit: int = 5) -> list[dict]:
    corrections = []
    if not text:
        return corrections
    for pattern, better in _GRAMMAR_FIXES:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            original = match.group(0)
            if original.lower() != better.lower():
                corrections.append({"original": original, "better": better})
            if len(corrections) >= limit:
                return corrections
    return corrections


def score_from_speech(qa_pairs: list) -> dict:
    """
    Evidence-based practice band. Empty / fake transcripts cannot score Band 5.
    """
    stats = analyze_session(qa_pairs)
    if stats["insufficient_session"]:
        return {
            "fluency_coherence": 1.0,
            "lexical_resource": 1.0,
            "grammar": 1.0,
            "pronunciation": "Not assessed — no clear speech was captured",
            "estimated_band": 1.0,
            "strengths": [],
            "weaknesses": [
                "No real English answers were captured. Most recordings were silent or only a stray word.",
                "The examiner cannot award Fluency, Vocabulary, or Grammar marks without connected speech.",
            ],
            "corrections": [],
            "part1_feedback": (
                f"Part 1: {stats['part_content'].get(1, 0)} real words. "
                "This is not enough. Answer each question with 3–4 sentences."
            ),
            "part2_feedback": (
                f"Part 2: {stats['part_content'].get(2, 0)} real words. "
                "You need about 1–2 minutes of continuous speech on the cue card."
            ),
            "part3_feedback": (
                f"Part 3: {stats['part_content'].get(3, 0)} real words. "
                "Give an opinion, a reason, and an example for each question."
            ),
            "improvement_tips": (
                "Sit closer to the microphone, allow mic permission, speak in English for several seconds, "
                "then stop. Do not move to the next question until you hear your own sentences in the transcript."
            ),
            "detailed_feedback": (
                f"Insufficient speech: {stats['real_answers']} usable answers out of "
                f"{stats['question_count']} questions, {stats['total_content_words']} content words total. "
                "Band 1 means almost no communication was recorded. This is not a real IELTS result — "
                "retake the test and actually speak."
            ),
        }

    words = stats["total_content_words"]
    # Word count alone is not Band 6. IELTS 6 needs developed, fairly accurate speech.
    if words < 50:
        base = 2.5
    elif words < 100:
        base = 3.5
    elif words < 180:
        base = 4.0
    elif words < 280:
        base = 4.5
    elif words < 400:
        base = 5.0
    else:
        base = 5.5

    fc = base
    lr = base
    gr = base

    if stats["avg_sentence_len"] >= 10 and stats["unique_ratio"] >= 0.5:
        fc += 0.5
        gr += 0.5
    if stats["avg_sentence_len"] < 6:
        fc -= 0.5
    if stats["unique_ratio"] >= 0.55:
        lr += 0.5
    if stats["unique_ratio"] < 0.45:
        lr -= 0.5
        fc -= 0.5
    if stats["unique_ratio"] < 0.35:
        lr -= 0.5
        fc -= 0.5
    if stats["linker_count"] >= 3:
        fc += 0.5
    p2 = stats["part_content"].get(2, 0)
    if p2 < 30:
        fc -= 1.5
    elif p2 < 80:
        fc -= 1.0
    elif p2 < 120:
        fc -= 0.5
    if stats["empty_answers"] >= 3:
        fc -= 1.0
        lr -= 0.5

    grammar_hits = extract_corrections(stats["joined"])
    if grammar_hits:
        gr -= 0.5 if len(grammar_hits) == 1 else 1.0

    def rb(v: float) -> float:
        return round(max(1.0, min(8.0, v)) * 2) / 2

    fc, lr, gr = rb(fc), rb(lr), rb(gr)
    estimated = rb((fc + lr + gr) / 3)

    strengths = []
    weaknesses = []
    if stats["real_answers"] >= 8 and stats["unique_ratio"] >= 0.45:
        strengths.append(f"You produced connected English on {stats['real_answers']} questions.")
    if stats["avg_sentence_len"] >= 10:
        strengths.append("Average sentence length shows some idea development.")
    if stats["linker_count"] >= 3:
        strengths.append("Some linking phrases were used (because / however / for example).")
    if stats["empty_answers"]:
        weaknesses.append(
            f"{stats['empty_answers']} answers were too short or silent and pulled the band down."
        )
    if stats["part_content"].get(2, 0) < 120:
        weaknesses.append(
            "Part 2 is below the IELTS long-turn standard (about 1–2 minutes). "
            "Cover every cue-card bullet with reasons and examples."
        )
    if stats["unique_ratio"] < 0.45:
        weaknesses.append("Vocabulary is repetitive. Use more precise words instead of repeating the same ones.")
    if not strengths:
        strengths.append("A small amount of English was captured, but it is below a developed mock-test performance.")
    if not weaknesses:
        weaknesses.append("Extend every answer with a reason and a concrete example.")

    return {
        "fluency_coherence": fc,
        "lexical_resource": lr,
        "grammar": gr,
        "pronunciation": "Not assessed from audio in this version — scoring is based on your transcript",
        "estimated_band": estimated,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "corrections": grammar_hits,
        "part1_feedback": (
            f"Part 1: {stats['part_content'].get(1, 0)} content words. "
            "Each familiar-topic answer should be 3–4 sentences."
        ),
        "part2_feedback": (
            f"Part 2: {stats['part_content'].get(2, 0)} content words. "
            "Cover every bullet on the cue card and keep talking until the time is up."
        ),
        "part3_feedback": (
            f"Part 3: {stats['part_content'].get(3, 0)} content words. "
            "Discuss causes, effects, and comparisons, not one-line opinions."
        ),
        "improvement_tips": (
            "Score is based only on the English Whisper heard. "
            "Speak louder, in full sentences, and check the on-screen transcript after each answer."
        ),
        "detailed_feedback": (
            f"Scored from your actual speech: {stats['real_answers']} usable answers, "
            f"{stats['total_content_words']} content words, "
            f"{stats['total_duration']:.0f}s talking time, "
            f"avg sentence length {stats['avg_sentence_len']:.1f} words. "
            "This is a practice estimate, not an official IELTS result."
        ),
    }
