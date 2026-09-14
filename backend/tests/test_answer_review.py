from app.speaking.services.answer_review import review_answer, review_session, cap_result_to_answers


def test_off_topic_quotes_what_was_said():
    review = review_answer(
        "What kind of food do you like?",
        "I love playing football with my friends every weekend.",
        part=1,
        duration=12,
    )
    assert review["answer_band"] <= 4.0
    assert review["relevance_label"] == "off_topic"
    assert any("football" in c.lower() or "off-topic" in c.lower() for c in review["mark_cuts"])


def test_repetition_is_called_out():
    review = review_answer(
        "Do you enjoy cooking?",
        "I like cooking I like cooking I like cooking I like cooking food cooking food cooking.",
        part=1,
        duration=20,
    )
    assert review["answer_band"] <= 4.5
    assert any("repeat" in c.lower() or "looping" in c.lower() for c in review["mark_cuts"])


def test_short_part2_is_penalised():
    review = review_answer(
        "Describe a meal you enjoyed.",
        "I ate rice and I liked it because it was nice.",
        part=2,
        duration=18,
    )
    assert review["answer_band"] <= 4.5
    assert any("short" in c.lower() or "part 2" in c.lower() for c in review["mark_cuts"])


def test_session_cap_pulls_inflated_overall_down():
    pairs = [
        {
            "part": 1,
            "question_text": "Do you like spicy food?",
            "transcript": "Yes I like it. Yes I like it. Yes I like it.",
            "duration": 8,
        },
        {
            "part": 2,
            "question_text": "Describe a traditional dish.",
            "transcript": "It is good. It is good.",
            "duration": 10,
        },
    ]
    reviews = review_session(pairs)
    inflated = {
        "fluency_coherence": 6.0,
        "lexical_resource": 6.0,
        "grammar": 6.5,
        "estimated_band": 6.0,
    }
    capped = cap_result_to_answers(inflated, reviews)
    assert capped["estimated_band"] <= 4.5
