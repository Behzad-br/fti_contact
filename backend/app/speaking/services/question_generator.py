"""
services/question_generator.py — Generate fresh IELTS Speaking tests via MiniMax.

Features:
  - Generates Part 1 (5 questions), Part 2 cue card, Part 3 (5 questions)
  - No-repeat: sends recent question topics as context to minimize repetition
  - Validates the JSON response before returning
  - Retries on invalid JSON (MiniMax client handles up to 2 retries internally)
  - Falls back to a stored test if generation fails
"""
import logging
import uuid
from typing import Optional

from app.llm.client import minimax_client, MinimaxError
from app.speaking.services.question_bank import get_random_test, validate_test

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an expert IELTS Speaking examiner creating realistic mock test questions.

Generate a complete IELTS Speaking test with:
- Part 1: 5 personal/familiar topic questions (short answers expected)
- Part 2: One cue card topic with 4 bullet points (student speaks 1-2 minutes)
- Part 3: 5 deeper discussion/opinion questions related to the Part 2 topic

IELTS Speaking style guidelines:
- Part 1 questions are about familiar topics (home, work, hobbies, daily life, preferences)
- Part 2 is a monologue about a person, place, object, experience, or skill
- Part 3 questions require analysis, opinions, comparisons, and abstract thinking
- Questions should be clear, natural, and suitable for B1-C1 level speakers

You MUST respond with valid JSON only — no markdown, no explanation, just the JSON object.

JSON schema:
{
  "id": "fresh-<uuid>",
  "title": "IELTS Speaking Practice — <Part 2 topic summary>",
  "part1": ["question1", "question2", "question3", "question4", "question5"],
  "part2": {
    "topic": "Describe a [person/place/experience/skill/object]...",
    "bullets": [
      "what/who it is",
      "when/where it happened",
      "how/why it affected you",
      "and explain why it is important/memorable to you"
    ]
  },
  "part3": ["question1", "question2", "question3", "question4", "question5"]
}"""


def _build_user_prompt(
    recent_topics: Optional[list] = None,
    theme: Optional[str] = None,
    focus_part: Optional[int] = None,
) -> str:
    lines = ["Generate a NEW complete IELTS Speaking test. Return only valid JSON."]
    if theme:
        lines.append(f"Theme the questions around: {theme}.")
    if focus_part == 1:
        lines.append("Part 1 must be 5 natural everyday questions (home, work, study, hobbies, habits).")
    elif focus_part == 2:
        lines.append("Part 2 must be a strong cue card with 4 clear bullets a candidate can speak on for 1–2 minutes.")
    elif focus_part == 3:
        lines.append("Part 3 must be 5 abstract discussion questions (compare, evaluate, predict, give opinions).")
    if recent_topics:
        topics_str = ", ".join(recent_topics[-5:])
        lines.append(f"Do NOT use these recently-used Part 2 topics: {topics_str}.")
    return " ".join(lines)


async def generate_fresh_test(
    recent_topics: Optional[list] = None,
    theme: Optional[str] = None,
    focus_part: Optional[int] = None,
) -> dict:
    """
    Generate a fresh IELTS Speaking test via MiniMax.

    Args:
        recent_topics: List of recent Part 2 topics to avoid repetition.

    Returns:
        A validated test dict.

    Raises:
        RuntimeError if generation fails and no fallback is available.
    """
    user_prompt = _build_user_prompt(recent_topics, theme=theme, focus_part=focus_part)

    try:
        test = await minimax_client.chat_json(_SYSTEM_PROMPT, user_prompt)
    except MinimaxError as exc:
        logger.warning("MiniMax question generation failed: %s — trying fallback.", exc)
        return _fallback_test()

    # Ensure ID is fresh
    test["id"] = f"fresh-{uuid.uuid4().hex[:8]}"

    # Validate
    valid, error = validate_test(test)
    if not valid:
        logger.warning("Generated test failed validation (%s) — trying fallback.", error)
        return _fallback_test()

    logger.info("Generated fresh test: %s", test.get("title", ""))
    return test


def _fallback_test() -> dict:
    """Fall back to a random stored test if AI generation fails."""
    fallback = get_random_test()
    if fallback:
        logger.info("Using fallback stored test: %s", fallback.get("id"))
        return fallback

    # Last resort — a minimal hardcoded test
    logger.warning("No stored tests available. Using hardcoded emergency test.")
    return {
        "id": "emergency-001",
        "title": "IELTS Speaking Practice",
        "part1": [
            "Do you work or study?",
            "What do you like to do in your free time?",
            "Do you enjoy cooking? Why or why not?",
            "How often do you use public transport?",
            "Have you visited any interesting places recently?",
        ],
        "part2": {
            "topic": "Describe a skill you would like to learn.",
            "bullets": [
                "what the skill is",
                "why you want to learn it",
                "how you would learn it",
                "and explain why it would be useful to you",
            ],
        },
        "part3": [
            "Why do you think some people find it difficult to learn new skills?",
            "How has technology changed the way people learn skills?",
            "Do you think formal education or self-study is better for learning skills?",
            "What skills do you think will be most important in the future?",
            "How can governments encourage people to develop new skills?",
        ],
    }
