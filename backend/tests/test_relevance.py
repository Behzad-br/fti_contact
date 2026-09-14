"""Tests for question-answer relevance scoring."""
from app.speaking.services.relevance import score_relevance, session_relevance


def test_grow_up_answer_is_on_topic():
    rel = score_relevance(
        "Where did you grow up?",
        "I grew up in a small city with my parents and I still remember my childhood home.",
    )
    assert rel["label"] in ("on_topic", "partly")
    assert rel["score"] >= 0.28


def test_born_in_city_matches_grow_up():
    rel = score_relevance(
        "Where did you grow up?",
        "I was born in Lahore and I lived there until I finished school.",
    )
    assert rel["score"] >= 0.28


def test_off_topic_cooking_for_work_question():
    rel = score_relevance(
        "What kind of work would you like to do in the future?",
        "I really love cooking pasta and watching football on the weekend with my friends.",
    )
    assert rel["label"] == "off_topic"
    assert rel["score"] < 0.38


def test_repeated_phrase_is_not_full_on_topic():
    rel = score_relevance(
        "Do you work or are you a student?",
        "I work as a student. I work as a student. I work as a student. I am a student.",
    )
    assert rel["label"] in ("partly", "off_topic")
    assert rel["score"] < 0.62


def test_jedi_future_job_is_off_topic():
    rel = score_relevance(
        "What kind of work would you like to do in the future?",
        "I think together you are seeing William in the Jedi of villain movies What do you think that the Jedi has a concept of thoughts?",
    )
    assert rel["label"] == "off_topic"


def test_hours_echo_without_number_is_not_on_topic():
    rel = score_relevance(
        "How many hours a week do you think is a reasonable amount to work?",
        "I think so. So how many years have you been a fee? I want a disabled amount to work. So I have to work a lot.",
    )
    assert rel["label"] != "on_topic"


def test_health_employer_question_on_topic():
    rel = score_relevance(
        "Should employers be responsible for the health and wellbeing of their employees?",
        "I think employers should care about employee health because people spend many hours at work and stress can cause illness.",
    )
    assert rel["label"] == "on_topic"


def test_session_penalises_off_topic_mix():
    pairs = [
        {
            "part": 1,
            "question_text": "Where did you grow up?",
            "transcript": "I grew up in Karachi with my family.",
        },
        {
            "part": 1,
            "question_text": "What kind of work would you like to do in the future?",
            "transcript": "My favourite food is pizza and I watch movies every night.",
        },
    ]
    summary = session_relevance(pairs)
    assert summary["off_topic_count"] >= 1
    assert summary["average"] < 0.8
