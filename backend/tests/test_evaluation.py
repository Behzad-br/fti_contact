"""
tests/test_evaluation.py — Test evaluation parsing and normalization.
MiniMax API calls are mocked — no real API calls made.
"""
import pytest
from unittest.mock import AsyncMock, patch

from app.speaking.services.evaluation import _normalize_evaluation, evaluate_session
from app.llm.client import MinimaxError


def test_normalize_evaluation_basic():
    raw = {
        "fluency_coherence": 6.5,
        "lexical_resource": 6.0,
        "grammar": 7.0,
        "pronunciation": "some text",  # Should be overridden
        "estimated_band": 6.5,
        "strengths": ["Good vocabulary"],
        "weaknesses": ["Uses fillers"],
        "corrections": [{"original": "I goed", "better": "I went"}],
        "part1_feedback": "Good",
        "part2_feedback": "Excellent",
        "part3_feedback": "Solid",
        "improvement_tips": "Reduce fillers",
        "detailed_feedback": "B2 level",
    }
    result = _normalize_evaluation(raw)

    # Pronunciation must always be this string
    assert result["pronunciation"] == "Not assessed in this version"
    assert result["fluency_coherence"] == 6.5
    assert result["lexical_resource"] == 6.0
    assert result["grammar"] == 7.0
    assert isinstance(result["strengths"], list)
    assert isinstance(result["corrections"], list)


def test_normalize_evaluation_clamps_out_of_range():
    raw = {
        "fluency_coherence": 15.0,  # Out of range
        "lexical_resource": -1.0,   # Out of range
        "grammar": 8.0,
        "estimated_band": 20.0,
    }
    result = _normalize_evaluation(raw)
    assert result["fluency_coherence"] == 9.0  # Clamped to max
    assert result["lexical_resource"] == 0.0   # Clamped to min


def test_normalize_handles_missing_fields():
    raw = {}
    result = _normalize_evaluation(raw)
    assert result["pronunciation"] == "Not assessed in this version"
    assert result["strengths"] == []
    assert result["weaknesses"] == []
    assert result["corrections"] == []


def test_normalize_calculates_band_from_dimensions():
    raw = {
        "fluency_coherence": 6.0,
        "lexical_resource": 6.0,
        "grammar": 6.0,
        # No estimated_band provided
    }
    result = _normalize_evaluation(raw)
    # Average of 6, 6, 6 = 6.0 → rounded to nearest 0.5 = 6.0
    assert result["estimated_band"] == 6.0


def test_normalize_rounds_band_to_half():
    raw = {
        "fluency_coherence": 6.0,
        "lexical_resource": 6.5,
        "grammar": 6.0,
    }
    result = _normalize_evaluation(raw)
    # Average = 6.167 → nearest 0.5 = 6.0
    assert result["estimated_band"] in [6.0, 6.5]


@pytest.mark.asyncio
async def test_evaluate_session_mocked():
    """Test that evaluate_session calls minimax and returns normalized result."""
    mock_response = {
        "fluency_coherence": 6.5,
        "lexical_resource": 6.0,
        "grammar": 6.5,
        "pronunciation": "whatever",
        "estimated_band": 6.5,
        "strengths": ["Good answers"],
        "weaknesses": ["Fillers"],
        "corrections": [],
        "part1_feedback": "OK",
        "part2_feedback": "Good",
        "part3_feedback": "Fine",
        "improvement_tips": "Practice more",
        "detailed_feedback": "B2 overall",
    }

    qa_pairs = [
        {
            "part": 1,
            "question_text": "Q1",
            "transcript": (
                "I work as an engineer in a software company and I enjoy solving problems with my teammates every day. "
                "In my free time I read about new technology and I also go for a walk because it helps me relax after work. "
                "I would like to keep learning because the industry changes very quickly."
            ),
            "duration": 28.0,
            "word_count": 60,
            "filler_count": 0,
            "words_per_minute": 128,
        },
        {
            "part": 2,
            "question_text": "Describe a skill",
            "transcript": (
                "I would like to learn cooking because it is useful every day and I can share food with my family when we celebrate special occasions together. "
                "I first became interested in this skill when I was a teenager watching my mother in the kitchen. "
                "If I learned it well I could invite friends for dinner and save money instead of eating outside. "
                "For example I would start with simple dishes like rice and soup, then try more difficult recipes at the weekend. "
                "This skill would also help me live independently when I move to another city for work."
            ),
            "duration": 95.0,
            "word_count": 120,
            "filler_count": 1,
            "words_per_minute": 105,
        },
        {
            "part": 3,
            "question_text": "Why is it hard?",
            "transcript": (
                "People find it hard to learn new skills because they are busy and they do not practise regularly after work. "
                "Schools should also give students more practical lessons so they can try things before they choose a career. "
                "In the future technology will change jobs, so adults need to keep developing new abilities throughout their lives."
            ),
            "duration": 32.0,
            "word_count": 65,
            "filler_count": 0,
            "words_per_minute": 122,
        },
    ]

    with patch("app.speaking.services.evaluation.minimax_client") as mock_client:
        mock_client.chat_json = AsyncMock(return_value=mock_response)
        result = await evaluate_session(qa_pairs)

    assert result["pronunciation"] == "Not assessed in this version"
    assert result["estimated_band"] is not None
    assert "strengths" in result


@pytest.mark.asyncio
async def test_evaluate_session_falls_back_when_minimax_fails():
    qa_pairs = [
        {
            "part": 1,
            "question_text": "Q1",
            "transcript": "I work as an engineer in a software company and I enjoy it.",
            "duration": 8.0,
            "word_count": 12,
            "filler_count": 0,
            "words_per_minute": 90,
        },
        {
            "part": 2,
            "question_text": "Describe a skill",
            "transcript": "I would like to learn cooking because it is useful every day and I can share food with my family.",
            "duration": 20.0,
            "word_count": 22,
            "filler_count": 1,
            "words_per_minute": 66,
        },
    ]

    with patch("app.speaking.services.evaluation.minimax_client") as mock_client:
        mock_client.chat_json = AsyncMock(side_effect=MinimaxError("login fail"))
        result = await evaluate_session(qa_pairs)

    assert "not assessed" in result["pronunciation"].lower()
    assert result["estimated_band"] is not None
    assert 1.0 <= result["estimated_band"] <= 4.5
    assert result["weaknesses"]


def test_off_topic_nonsense_cannot_score_mid_band():
    from app.speaking.services.evaluation import _apply_relevance, _normalize_evaluation
    from app.speaking.services.speech_quality import score_from_speech

    qa_pairs = [
        {
            "part": 1,
            "question_text": "Do you work or are you a student?",
            "transcript": "I work as a student. I work as a student. I work as a student. I am a student.",
            "duration": 12.0,
        },
        {
            "part": 1,
            "question_text": "What kind of work would you like to do in the future?",
            "transcript": "Jedi villain movies and random thoughts about films I watched yesterday.",
            "duration": 10.0,
        },
        {
            "part": 2,
            "question_text": "Describe a job you think you would be good at.",
            "transcript": "So this is the drops of the tea and muscles in oil.",
            "duration": 18.0,
        },
        {
            "part": 3,
            "question_text": "How has remote working affected people's work-life balance?",
            "transcript": "How do you work in the factory? How do you work in the factory? People think that the more you work in the factory.",
            "duration": 20.0,
        },
    ]
    result = _apply_relevance(_normalize_evaluation(score_from_speech(qa_pairs)), qa_pairs)
    assert result["task_relevance"] <= 4.5
    assert result["estimated_band"] <= 4.5
    assert result["fluency_coherence"] <= 4.5
    qa_pairs = [
        {"part": 1, "question_text": "Q", "transcript": "you", "duration": 2.0}
        for _ in range(11)
    ]
    from app.speaking.services.speech_quality import score_from_speech
    result = score_from_speech(qa_pairs)
    assert result["estimated_band"] <= 2.0
    assert result["fluency_coherence"] <= 2.0
