"""Backend tests for the IELTS Listening module."""
from app.listening.services import bank
from app.listening.services.scoring import (
    PART_HIDDEN,
    QUESTION_HIDDEN,
    estimated_band,
    grade_attempt,
    is_correct,
    student_safe_test,
)


def _walk_keys(obj):
    keys = set()
    if isinstance(obj, dict):
        keys.update(obj.keys())
        for value in obj.values():
            keys.update(_walk_keys(value))
    elif isinstance(obj, list):
        for item in obj:
            keys.update(_walk_keys(item))
    return keys


def test_bank_has_original_and_imported_full_tests():
    catalog = bank.catalog()
    assert len(catalog["tests"]) >= 5
    for test in bank.all_tests():
        assert len(test["questions"]) >= 40
        assert len(test["parts"]) == 4
        assert test["duration_minutes"] == 30


def test_student_payload_hides_keys_and_transcripts():
    test = bank.get_test("listening-test-01")
    safe = student_safe_test(test)
    leaked = _walk_keys(safe) & (QUESTION_HIDDEN | PART_HIDDEN)
    assert not leaked


def test_multiple_choice_set_grading():
    test = bank.get_test("listening-test-01")
    multi = next(q for q in test["questions"] if q["type"] == "multiple_choice_multiple")
    assert is_correct(multi, list(reversed(multi["answer"])))
    assert not is_correct(multi, [multi["answer"][0]])


def test_perfect_score_is_band_nine():
    test = bank.get_test("listening-test-01")
    responses = {q["id"]: q["answer"] for q in test["questions"]}
    result = grade_attempt(test, responses, bank.thresholds())
    assert result["raw_score"] == 40
    assert result["estimated_band"] == 9
    assert estimated_band(23, bank.thresholds()) == 6
    assert estimated_band(16, bank.thresholds()) == 5
    assert estimated_band(30, bank.thresholds()) == 7
    assert estimated_band(35, bank.thresholds()) == 8
    assert estimated_band(39, bank.thresholds()) == 9
    assert estimated_band(0, bank.thresholds()) == 0
    assert estimated_band(1, bank.thresholds()) == 1
    assert estimated_band(3, bank.thresholds()) == 2


def test_listening_catalog_and_safe_api(client):
    catalog = client.get("/api/listening/catalog").json()
    assert len(catalog["tests"]) >= 5
    payload = client.get("/api/listening/tests/listening-test-01").json()
    assert payload["question_count"] == 40
    assert not (_walk_keys(payload) & (QUESTION_HIDDEN | PART_HIDDEN))


def test_submit_perfect_and_one_play(client):
    test = bank.get_test("listening-test-01")
    headers = {"X-Student-Id": "listening-test"}
    start = client.post(
        "/api/listening/attempts",
        json={"test_id": "listening-test-01", "mode": "full_mock", "timed": True},
        headers=headers,
    )
    assert start.status_code == 200, start.text
    body = start.json()
    assert not (_walk_keys(body["test"]) & (QUESTION_HIDDEN | PART_HIDDEN))
    attempt_id = body["attempt_id"]
    part_id = body["test"]["parts"][0]["id"]
    first = client.post(
        f"/api/listening/attempts/{attempt_id}/audio-start",
        json={"part_id": part_id},
        headers=headers,
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/listening/attempts/{attempt_id}/audio-start",
        json={"part_id": part_id},
        headers=headers,
    )
    assert second.status_code == 403
    responses = {q["id"]: q["answer"] for q in test["questions"]}
    result = client.post(
        f"/api/listening/attempts/{attempt_id}/submit",
        json={"responses": responses},
        headers=headers,
    )
    assert result.status_code == 200
    assert result.json()["raw_score"] == 40
    again = client.post(
        f"/api/listening/attempts/{attempt_id}/submit",
        json={"responses": {test["questions"][0]["id"]: "changed"}},
        headers=headers,
    )
    assert again.json()["raw_score"] == 40


_SCRIPT = " ".join(
    [
        "Advisor: Welcome to the Riverside Community Centre booking line.",
        "Caller: I need the main hall on the fourteenth of May please.",
        "Advisor: Yes, the hall is free that day from nine fifteen in the morning.",
        "Caller: Perfect. My name is Dana Cole and the group is the cycling club.",
        "Advisor: Please arrive at the side entrance on Maple Street.",
        "Caller: How many chairs should we request for the talk?",
        "Advisor: Forty chairs will be set out near the window.",
        "Caller: And is parking available behind the library?",
        "Advisor: Yes, use the library car park and bring membership card twelve.",
        "Caller: Thank you. We will also need a microphone and water jugs.",
        "Advisor: Both are included with the hall booking at no extra cost.",
    ]
)


def _ai_raw():
    questions = []
    for i in range(8):
        answer = "14 May" if i == 0 else f"room {i}"
        questions.append(
            {
                "type": "note_completion",
                "instruction": "Complete the notes. Write NO MORE THAN THREE WORDS AND/OR A NUMBER.",
                "prompt": "Date: ____" if i == 0 else f"Item {i}: ____",
                "answer": answer,
                "accepted_answers": [answer],
                "evidence": "said in the recording",
                "explanation": "from the script",
            }
        )
    return {
        "title": "Community Centre Booking",
        "part": {
            "title": "Community Centre Booking",
            "context": "A caller books a hall.",
            "setting": "everyday_social_dialogue",
            "script": _SCRIPT,
        },
        "questions": questions,
    }


def _wrap_ai_part(token="live01"):
    from app.listening.services.generate import normalize_generated

    part = normalize_generated(_ai_raw(), part_number=1, start_number=1, count=8, token=token)
    return {
        "id": f"ai-listen-part-{token}",
        "title": "Fresh AI Listening — Community Centre Booking",
        "duration_minutes": 8,
        "generated_by_ai": True,
        "audio_status": "ai_tts_preview",
        "instructions": [],
        "parts": [{**part["part"], "audio_file": "ai-dummy.mp3", "audio_asset": "ai-dummy.mp3"}],
        "questions": part["questions"],
    }


def test_ai_payload_hides_script_and_keys():
    wrapped = _wrap_ai_part()
    safe = student_safe_test(wrapped)
    leaked = _walk_keys(safe) & (QUESTION_HIDDEN | PART_HIDDEN)
    assert not leaked
    assert safe["generated_by_ai"] is True
    assert "Advisor:" not in str(safe)


def test_ai_part_start_disabled_for_listening(client, monkeypatch):
    """Listening AI generate is Speaking-only for now; AI review helpers still work offline."""
    import asyncio

    from app.listening.services.generate import ai_review_short_answers

    wrapped = _wrap_ai_part()

    async def fake_chat_json(*args, **kwargs):
        qid = wrapped["questions"][0]["id"]
        return {"verdicts": [{"question_id": qid, "correct": True, "reason": "same date"}]}

    monkeypatch.setattr("app.listening.services.generate.minimax_client.chat_json", fake_chat_json)

    first = wrapped["questions"][0]
    assert not is_correct(first, "14th May")
    graded = grade_attempt(wrapped, {first["id"]: "14th May"}, bank.thresholds())
    reviewed = asyncio.run(ai_review_short_answers(wrapped, graded))
    assert reviewed["details"][0]["correct"] is True
    assert reviewed["details"][0]["ai_accepted"] is True
    assert reviewed["graded_by"] == "ai"

    start = client.post(
        "/api/listening/attempts",
        json={"test_id": "ai", "mode": "ai_part", "timed": False},
        headers={"X-Student-Id": "listening-ai"},
    )
    assert start.status_code == 400
    assert "Speaking" in start.json()["detail"]


def test_ai_full_mock_disabled_for_listening(client):
    start = client.post(
        "/api/listening/attempts",
        json={"test_id": "ai", "mode": "ai_full_mock", "timed": True},
        headers={"X-Student-Id": "listening-ai-mock"},
    )
    assert start.status_code == 400
    assert "Speaking" in start.json()["detail"]


def test_practice_full_mock_allows_seeking(client):
    start = client.post(
        "/api/listening/attempts",
        json={"test_id": "listening-test-01", "mode": "full_mock", "timed": False},
        headers={"X-Student-Id": "listening-practice-seek"},
    )
    assert start.status_code == 200, start.text
    assert start.json()["policy"]["seeking_allowed"] is True
    assert start.json()["policy"]["plays_allowed"] == 99
