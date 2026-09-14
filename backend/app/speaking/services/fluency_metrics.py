"""
services/fluency_metrics.py — Local transcript metrics.

Adapted from scripts/analyze_transcript.py in the original repo.

Calculates basic fluency signals from text + duration:
  - word count
  - words per minute
  - filler word count
  - unusually short answer flag

These are used as supporting signals for Fluency & Coherence scoring.
They do NOT replace IELTS examiner judgment.
"""
import re
from typing import Optional

# Common English filler words to detect
_FILLERS = {
    "um", "uh", "er", "ah", "like", "you know", "i mean",
    "basically", "literally", "actually", "kind of", "sort of",
    "right", "okay", "so yeah", "well",
}


def calculate_metrics(transcript: str, duration_seconds: Optional[float]) -> dict:
    """
    Calculate fluency metrics from transcript text and audio duration.

    Args:
        transcript: Whisper-generated transcript text
        duration_seconds: Recording duration in seconds (can be None)

    Returns:
        dict with: word_count, filler_count, words_per_minute, is_very_short
    """
    if not transcript:
        return {
            "word_count": 0,
            "filler_count": 0,
            "words_per_minute": None,
            "is_very_short": True,
        }

    words = transcript.strip().split()
    word_count = len(words)

    # Count fillers (whole-word match)
    text_lower = transcript.lower()
    filler_count = 0
    for filler in _FILLERS:
        pattern = r'\b' + re.escape(filler) + r'\b'
        matches = re.findall(pattern, text_lower)
        filler_count += len(matches)

    # Words per minute (only if duration is available and > 0)
    wpm: Optional[float] = None
    if duration_seconds and duration_seconds > 0:
        wpm = round((word_count / duration_seconds) * 60, 1)

    # Flag suspiciously short answers (< 15 words or < 5 seconds)
    is_very_short = word_count < 15 or (duration_seconds is not None and duration_seconds < 5)

    return {
        "word_count": word_count,
        "filler_count": filler_count,
        "words_per_minute": wpm,
        "is_very_short": is_very_short,
    }


def build_fluency_context(answers: list) -> str:
    """
    Build a summary string of fluency metrics for all answers
    to include in the MiniMax evaluation prompt.
    """
    lines = ["### Fluency Metrics (auto-calculated from transcripts)"]
    total_words = 0
    total_fillers = 0
    total_duration = 0.0

    for ans in answers:
        part = ans.get("part")
        q_text = ans.get("question_text", "")[:50]
        transcript = ans.get("transcript", "")
        duration = ans.get("duration") or 0
        metrics = calculate_metrics(transcript, duration)

        total_words += metrics["word_count"]
        total_fillers += metrics["filler_count"]
        total_duration += duration

        wpm_str = f"{metrics['words_per_minute']} WPM" if metrics["words_per_minute"] else "N/A"
        short_flag = " ⚠️ Very short" if metrics["is_very_short"] else ""

        lines.append(
            f"  Part {part} | {q_text}... | "
            f"Words: {metrics['word_count']} | WPM: {wpm_str} | "
            f"Fillers: {metrics['filler_count']}{short_flag}"
        )

    lines.append(
        f"\nTotals: {total_words} words, {total_fillers} fillers, "
        f"{total_duration:.0f}s speaking time"
    )

    return "\n".join(lines)
