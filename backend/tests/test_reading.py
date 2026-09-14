"""Backend tests for the IELTS Reading module."""
from app.reading.services import bank
from app.reading.services.scoring import (
    SERVER_ONLY_FIELDS,
    estimated_band,
    grade_attempt,
    student_safe_test,
    word_limit_from_instruction,
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


def test_bank_has_ten_full_tests():
    catalog = bank.catalog()
    assert len(catalog["academic"]) >= 5
    assert len(catalog["general_training"]) >= 5
    assert len(catalog["question_types"]) == 14
    assert any(item["id"] == "academic-reading-01" for item in catalog["academic"])
    fti = [
        test
        for test in bank.all_tests()
        if str(test.get("id") or "").startswith(("academic-reading-", "general-reading-"))
    ]
    assert len(fti) >= 10
    for test in fti:
        assert len(test["questions"]) == 40
        assert test["duration_minutes"] == 60
        assert len(test["passages"]) == 3


def test_student_payload_hides_answer_keys():
    test = bank.get_test("academic-reading-01")
    safe = student_safe_test(test)
    leaked = _walk_keys(safe) & SERVER_ONLY_FIELDS
    assert not leaked
    assert "sentence_records" not in str(safe.get("passages"))


def test_word_limit_parser():
    assert word_limit_from_instruction("Use NO MORE THAN THREE WORDS.") == 3
    assert word_limit_from_instruction("Use NO MORE THAN FOUR WORDS AND/OR A NUMBER.") == 4
    assert word_limit_from_instruction("Choose A, B, C or D.") is None


def test_perfect_academic_score_is_band_nine():
    test = bank.get_test("academic-reading-01")
    responses = {str(q["number"]): q["accepted_answers"][0] for q in test["questions"]}
    result = grade_attempt(test, responses, bank.thresholds_for("academic"))
    assert result["raw_score"] == 40
    assert result["unanswered"] == 0
    assert result["incorrect"] == 0
    assert result["estimated_band"] == 9
    assert result["label"] == "Estimated practice band"


def test_unanswered_is_not_incorrect():
    test = bank.get_test("academic-reading-01")
    first = test["questions"][0]
    responses = {str(first["number"]): "definitely-wrong"}
    result = grade_attempt(test, responses, bank.thresholds_for("academic"))
    assert result["correct"] == 0
    assert result["incorrect"] == 1
    assert result["unanswered"] == 39


def test_academic_and_gt_tables_differ():
    academic = bank.thresholds_for("academic")
    general = bank.thresholds_for("general_training")
    assert estimated_band(23, academic) == 6
    assert estimated_band(23, general) == 5
    assert estimated_band(40, academic) == 9
    assert estimated_band(40, general) == 9


def test_tfng_and_multi_letter_aliases():
    from app.reading.services.scoring import is_correct

    tfng = {"type": "true_false_not_given", "accepted_answers": ["TRUE"]}
    assert is_correct(tfng, "True")
    assert is_correct(tfng, "T")
    ynng = {"type": "yes_no_not_given", "accepted_answers": ["NOT GIVEN"]}
    assert is_correct(ynng, "NG")
    multi = {"type": "multiple_choice", "accepted_answers": ["A, C"]}
    assert is_correct(multi, "C, A")
    assert is_correct(multi, "AC")
    assert not is_correct(multi, "A")


def test_reading_catalog_and_test_api(client):
    catalog = client.get("/api/reading/catalog").json()
    assert len(catalog["academic"]) >= 5
    payload = client.get("/api/reading/tests/academic-reading-01").json()
    assert payload["question_count"] == 40
    leaked = _walk_keys(payload) & SERVER_ONLY_FIELDS
    assert not leaked


def test_submit_perfect_and_idempotent(client):
    test = bank.get_test("academic-reading-01")
    start = client.post(
        "/api/reading/attempts",
        json={"test_id": "academic-reading-01", "mode": "full_mock", "timed": False},
        headers={"X-Student-Id": "reading-test"},
    )
    assert start.status_code == 200, start.text
    body = start.json()
    assert "accepted_answers" not in str(body)
    attempt_id = body["attempt_id"]
    responses = {str(q["number"]): q["accepted_answers"][0] for q in test["questions"]}
    first = client.post(
        f"/api/reading/attempts/{attempt_id}/submit",
        json={"responses": responses},
        headers={"X-Student-Id": "reading-test"},
    )
    assert first.status_code == 200
    result = first.json()
    assert result["raw_score"] == 40
    assert result["estimated_band"] == 9
    assert result["details"][0]["explanation"]
    second = client.post(
        f"/api/reading/attempts/{attempt_id}/submit",
        json={"responses": {"1": "changed"}},
        headers={"X-Student-Id": "reading-test"},
    )
    assert second.json()["raw_score"] == 40
    result_get = client.get(
        f"/api/reading/attempts/{attempt_id}/result",
        headers={"X-Student-Id": "reading-test"},
    )
    assert result_get.json()["correct"] == 40


def test_question_type_practice_api(client):
    payload = client.get("/api/reading/practice?question_type=multiple_choice&test_type=academic").json()
    assert payload["questions"]
    assert all(q["type"] == "multiple_choice" for q in payload["questions"])
    leaked = _walk_keys(payload) & SERVER_ONLY_FIELDS
    assert not leaked


def _ai_raw():
    paragraphs = [
        {
            "label": letter,
            "heading": f"Heading {letter}",
            "text": f"Paragraph {letter} explains that the harbour trial began in 2019 and used recycled timber for six months.",
        }
        for letter in "ABCDEF"
    ]
    return {
        "title": "Harbour Timber Trial",
        "passage": {"title": "Harbour Timber Trial", "paragraphs": paragraphs},
        "questions": [
            {
                "type": "multiple_choice",
                "prompt": "When did the trial begin?",
                "options": [
                    {"code": "A", "text": "2018"},
                    {"code": "B", "text": "2019"},
                    {"code": "C", "text": "2020"},
                    {"code": "D", "text": "2021"},
                ],
                "answer": "B",
                "accepted_answers": ["B"],
                "evidence": "the harbour trial began in 2019",
                "explanation": "Paragraph A states 2019.",
            }
            for _ in range(8)
        ],
    }


def test_normalize_generated_passage():
    from app.reading.services.generate import normalize_generated
    from app.reading.services.scoring import student_safe_test

    part = normalize_generated(
        _ai_raw(),
        test_type="academic",
        passage_index=1,
        start_number=1,
        count=8,
        token="test12",
    )
    assert len(part["questions"]) == 8
    assert part["questions"][0]["accepted_answers"] == ["B"]
    wrapped = {
        "id": "ai-x",
        "title": part["title"],
        "test_type": "academic",
        "generated_by_ai": True,
        "passages": [part["passage"]],
        "questions": part["questions"],
        "instructions": [],
    }
    safe = student_safe_test(wrapped)
    assert not (_walk_keys(safe) & SERVER_ONLY_FIELDS)


def test_ai_passage_start_hides_keys(client, monkeypatch):
    from app.reading.services.generate import normalize_generated

    async def fake_generate(**kwargs):
        part = normalize_generated(
            _ai_raw(),
            test_type="academic",
            passage_index=1,
            start_number=1,
            count=8,
            token="live01",
        )
        return {
            "id": "ai-passage-live01",
            "title": "Fresh AI Academic — Harbour Timber Trial",
            "test_type": "academic",
            "duration_minutes": 20,
            "generated_by_ai": True,
            "instructions": [],
            "passages": [part["passage"]],
            "questions": part["questions"],
        }

    monkeypatch.setattr("app.reading.controllers.reading.generate_ai_test", fake_generate)
    start = client.post(
        "/api/reading/attempts",
        json={"test_id": "academic", "mode": "ai_passage", "timed": False},
        headers={"X-Student-Id": "reading-ai"},
    )
    assert start.status_code == 200, start.text
    body = start.json()
    assert body["test"]["generated_by_ai"] is True
    assert not (_walk_keys(body["test"]) & SERVER_ONLY_FIELDS)
    submit = client.post(
        f"/api/reading/attempts/{body['attempt_id']}/submit",
        json={"responses": {str(i): "B" for i in range(1, 9)}},
        headers={"X-Student-Id": "reading-ai"},
    )
    assert submit.status_code == 200
    assert submit.json()["correct"] == 8
    assert submit.json()["generated_by_ai"] is True
