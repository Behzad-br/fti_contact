"""Backend tests for the IELTS Writing module."""
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.writing.models import WritingAttempt, WritingQuestion
from app.writing.services.writing_core import (
    count_words,
    is_duplicate_prompt,
    overall_writing_band,
    validate_grading_payload,
    validate_visual_data,
)
from app.writing.services.writing_import import import_records, record_from_bank_item
from app.writing.services.writing_progress import collect_progress

BANK = Path(__file__).resolve().parents[2] / "data" / "ielts_writing_starter_bank_150.json"


def _seed_question(db, **kwargs):
    data = {
        "public_id": kwargs.get("public_id", "AWT1-TEST"),
        "test_type": kwargs.get("test_type", "academic"),
        "task_number": kwargs.get("task_number", 1),
        "question_type": kwargs.get("question_type", "bar_chart"),
        "topic": kwargs.get("topic", "transport"),
        "difficulty": kwargs.get("difficulty", "medium"),
        "prompt": kwargs.get("prompt", "The bar chart below shows transport use."),
        "minimum_words": kwargs.get("minimum_words", 150),
        "recommended_minutes": 20,
        "status": kwargs.get("status", "published"),
        "is_permanent_bank": kwargs.get("is_permanent_bank", True),
        "source_type": "original_generated",
    }
    q = WritingQuestion(**data)
    q.visual_data = kwargs.get(
        "visual_data",
        {
            "type": "bar_chart",
            "title": "Transport",
            "unit": "hours",
            "years": [2010, 2020],
            "categories": ["A", "B"],
            "series": {"A": [1, 2], "B": [3, 4]},
        },
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def test_word_count_and_weighting():
    assert count_words("The number of people increased.") == 5
    assert overall_writing_band(6.0, 7.5) == 7.0
    assert overall_writing_band(5.0, 6.0) == 5.5


def test_duplicate_and_visual_validation():
    assert is_duplicate_prompt(
        "The line graph below shows renewable energy use in Northport over several years.",
        "The line graph below shows renewable energy use in Northport over several years.",
    )
    assert not is_duplicate_prompt(
        "The bar chart below shows daily public transport use in selected locations.",
        "Discuss both views on whether university education should be free.",
    )
    ok, err, data = validate_visual_data(
        "bar_chart",
        {
            "title": "x",
            "unit": "n",
            "years": [1, 2],
            "categories": ["A"],
            "series": {"A": [3, 4]},
        },
    )
    assert ok, err
    bad, msg, _ = validate_visual_data("bar_chart", {"series": {"A": ["x"]}})
    assert not bad


def test_grading_parser():
    parsed = validate_grading_payload(
        {
            "estimated_overall_band": 6.5,
            "criteria": {
                "task_response_or_achievement": {"band": 6, "feedback": "ok"},
                "coherence_and_cohesion": {"band": 6.5, "feedback": "ok"},
                "lexical_resource": {"band": 6.5, "feedback": "ok"},
                "grammatical_range_and_accuracy": {"band": 6, "feedback": "ok"},
            },
            "grammar_errors": [
                {
                    "original": "The number of people were increased.",
                    "suggested": "The number of people increased.",
                    "category": "verb usage",
                    "explanation": "agreement",
                }
            ],
        },
        1,
    )
    assert parsed["estimated_overall_band"] == 6.5
    assert parsed["grammar_errors"][0]["suggested"].startswith("The number")


def test_attach_practice_feedback_explains_short_answers():
    from app.writing.services.writing_core import attach_practice_feedback, validate_grading_payload

    parsed = validate_grading_payload(
        {
            "estimated_overall_band": 0,
            "criteria": {
                "task_response_or_achievement": {"band": 0, "feedback": "Almost no task content."},
                "coherence_and_cohesion": {"band": 0, "feedback": "Too short to organise."},
                "lexical_resource": {"band": 0, "feedback": "Very limited vocabulary."},
                "grammatical_range_and_accuracy": {"band": 0, "feedback": "Not enough sentences."},
            },
            "estimated_band_explanation": "The response is far below the minimum word count of 150, with only 12 characters provided.",
            "why_this_band": ["The response is far below the minimum word count of 150, with only 12 characters provided."],
        },
        1,
    )
    filled = attach_practice_feedback(
        parsed,
        task_number=1,
        test_type="academic",
        minimum_words=150,
        word_count=12,
    )
    assert filled["why_this_band"]
    assert any("12 words" in item for item in filled["why_this_band"])
    assert all("character" not in item.lower() for item in filled["why_this_band"])
    assert "character" not in filled["estimated_band_explanation"].lower()
    assert filled["next_steps"]
    assert any("150" in item for item in filled["next_steps"])


def test_gibberish_script_is_band_zero():
    from app.writing.services.writing_core import non_attempt_grading, script_attempt_kind

    assert script_attempt_kind("") == "empty"
    assert script_attempt_kind("mnh h n n n n n n n n n n n") == "non_attempt"
    assert script_attempt_kind("n n n n n n n n n n n n n n") == "non_attempt"
    real = "The bar chart shows transport use in two cities over ten years and compares bus and train travel."
    assert script_attempt_kind(real) == "attempt"
    assert script_attempt_kind("I strongly agree that education should be free for everyone.") == "attempt"
    graded = non_attempt_grading(
        task_number=1,
        test_type="academic",
        minimum_words=150,
        word_count=13,
        kind="non_attempt",
    )
    assert graded["estimated_overall_band"] == 0
    assert all(block["band"] == 0 for block in graded["criteria"].values())
    assert graded["non_attempt"] is True
    assert any("not a meaningful English" in item for item in graded["why_this_band"])


def test_import_bank_schema_and_skip_duplicates(db):
    item = {
        "id": "AWT1-UNIT",
        "test_type": "academic",
        "task": 1,
        "question_type": "line_graph",
        "topic": "energy",
        "difficulty": "easy",
        "prompt": "The line graph below shows energy.",
        "minimum_words": 150,
        "recommended_minutes": 20,
        "source_type": "original_generated",
        "publication_status": "draft_review_required",
        "visual_data": {
            "title": "Energy",
            "unit": "%",
            "years": [2000, 2010],
            "categories": ["A"],
            "series": {"A": [10, 20]},
        },
    }
    rec = record_from_bank_item(item)
    assert rec["status"] == "review"
    first = import_records(db, [item])
    assert first["imported"] == 1
    second = import_records(db, [item])
    assert second["skipped"] == 1
    q = db.query(WritingQuestion).filter_by(public_id="AWT1-UNIT").first()
    assert q.status == "review"


def test_starter_file_import_if_present(db):
    if not BANK.exists():
        pytest.skip("starter bank file missing")
    from app.writing.services.writing_import import import_file

    result = import_file(db, BANK, dry_run=True)
    assert result["imported"] >= 140
    assert result["dry_run"] is True


def test_student_cannot_see_drafts(client, db):
    _seed_question(db, public_id="DRAFT-1", status="draft", prompt="Hidden draft prompt about cities.")
    _seed_question(db, public_id="PUB-1", status="published", prompt="Visible published prompt about cities.")
    res = client.get("/api/writing/questions")
    assert res.status_code == 200
    ids = [q["public_id"] for q in res.json()["questions"]]
    assert "PUB-1" in ids
    assert "DRAFT-1" not in ids
    hidden = client.get("/api/writing/questions/DRAFT-1")
    assert hidden.status_code == 404


def test_filter_and_attempt_autosave_submit_permissions(client, db):
    _seed_question(db, public_id="BAR-1", question_type="bar_chart")
    listed = client.get("/api/writing/questions", params={"question_type": "bar_chart", "test_type": "academic"})
    assert listed.json()["total"] >= 1

    started = client.post("/api/writing/questions/BAR-1/start")
    assert started.status_code == 200
    attempt_id = started.json()["id"]
    saved = client.patch(
        f"/api/writing/attempts/{attempt_id}",
        json={"answer_text": "This is a draft about the bar chart showing transport."},
    )
    assert saved.status_code == 200
    assert saved.json()["word_count"] > 5

    other = client.patch(
        f"/api/writing/attempts/{attempt_id}",
        headers={"X-Student-Id": "someone-else"},
        json={"answer_text": "hack"},
    )
    assert other.status_code == 403

    with patch("app.writing.services.writing_ai.writing_chat_json", new=AsyncMock(return_value={
        "estimated_overall_band": 6.0,
        "criteria": {
            "task_response_or_achievement": {"band": 6.0, "feedback": "ok"},
            "coherence_and_cohesion": {"band": 6.0, "feedback": "ok"},
            "lexical_resource": {"band": 6.0, "feedback": "ok"},
            "grammatical_range_and_accuracy": {"band": 6.0, "feedback": "ok"},
        },
        "strengths": ["overview"],
        "priority_improvements": ["grammar"],
        "grammar_errors": [],
        "vocabulary_feedback": [],
        "structure_feedback": "ok",
        "task_specific_feedback": "ok",
        "next_steps": ["practice maps"],
    })):
        submitted = client.post(
            f"/api/writing/attempts/{attempt_id}/submit",
            json={"answer_text": "The bar chart illustrates transport use in two years."},
        )
    assert submitted.status_code == 200
    body = submitted.json()
    assert body["status"] == "graded"
    assert body["estimated_band"] == 6.0
    assert body["answer_text"].startswith("The bar chart")

    locked = client.patch(
        f"/api/writing/attempts/{attempt_id}",
        json={"answer_text": "changed after submit"},
    )
    assert locked.status_code == 409
    stored = db.query(WritingAttempt).filter_by(id=attempt_id).first()
    assert stored.submitted_text.startswith("The bar chart")


def test_teacher_override_and_progress(client, db):
    q = _seed_question(db, public_id="T2-1", task_number=2, question_type="agree_disagree", minimum_words=250)
    start = client.post(f"/api/writing/questions/{q.public_id}/start").json()
    with patch("app.writing.services.writing_ai.writing_chat_json", new=AsyncMock(return_value={
        "estimated_overall_band": 5.5,
        "criteria": {
            "task_response_or_achievement": {"band": 5.5, "feedback": "a"},
            "coherence_and_cohesion": {"band": 6.0, "feedback": "a"},
            "lexical_resource": {"band": 5.5, "feedback": "a"},
            "grammatical_range_and_accuracy": {"band": 5.0, "feedback": "a"},
        },
    })):
        client.post(
            f"/api/writing/attempts/{start['id']}/submit",
            json={"answer_text": "I agree with the statement because education matters. " * 20},
        )
    review = client.post(
        f"/api/writing/admin/submissions/{start['id']}/review",
        json={"teacher_band": 6.5, "teacher_comments": "Clearer position needed.", "publish": True},
    )
    assert review.status_code == 200
    assert review.json()["teacher_band"] == 6.5
    detail = client.get(f"/api/writing/attempts/{start['id']}").json()
    assert detail["band_source"] == "teacher"
    assert detail["final_band"] == 6.5
    assert detail["estimated_band"] == 5.5
    prog = collect_progress(db, "local")
    assert prog["attempts_completed"] >= 1


def test_mock_weighting_endpoint(client, db):
    _seed_question(db, public_id="M-T1", task_number=1, question_type="table")
    _seed_question(
        db,
        public_id="M-T2",
        task_number=2,
        question_type="discuss_both_views",
        prompt="Discuss both views on remote work.",
        minimum_words=250,
        visual_data=None,
    )
    mock = client.post("/api/writing/mock-tests", json={"test_type": "academic"}).json()
    assert mock["task1"]["id"]
    assert mock["task2"]["id"]
    with patch("app.writing.services.writing_ai.writing_chat_json", new=AsyncMock(return_value={
        "estimated_overall_band": 6.0,
        "criteria": {
            "task_response_or_achievement": {"band": 6.0, "feedback": "a"},
            "coherence_and_cohesion": {"band": 6.0, "feedback": "a"},
            "lexical_resource": {"band": 6.0, "feedback": "a"},
            "grammatical_range_and_accuracy": {"band": 6.0, "feedback": "a"},
        },
    })):
        done = client.post(
            f"/api/writing/mock-tests/{mock['id']}/submit",
            json={
                "task1": {"answer_text": "The table shows data for two years."},
                "task2": {"answer_text": "Some people think remote work is better. " * 20},
            },
        )
    assert done.status_code == 200
    assert done.json()["overall_estimated_band"] == 6.0
    assert done.json()["locked"] is True


def test_admin_cannot_be_spoofed_when_token_set(client, db, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "WRITING_ADMIN_TOKEN", "secret-token")
    denied = client.get("/api/writing/admin/questions")
    assert denied.status_code == 403
    ok = client.get("/api/writing/admin/questions", headers={"X-Admin-Token": "secret-token"})
    assert ok.status_code == 200


def test_generation_visual_roundtrip():
    from app.writing.services.writing_core import validate_visual_data

    ok, err, data = validate_visual_data(
        "line_graph",
        {
            "question_type": "line_graph",
            "title": "Household renewable energy use",
            "unit": "percentage",
            "years": [2000, 2010, 2020],
            "categories": ["Country A", "Country B", "Country C"],
            "series": {
                "Country A": [15, 30, 48],
                "Country B": [21, 28, 40],
                "Country C": [9, 20, 36],
            },
        },
    )
    assert ok, err
    assert data["series"]["Country A"][2] == 48


def test_image_only_pack_import(db):
    item = {
        "id": "cambridge-academic-book-21-test-01-task1",
        "test_type": "academic",
        "task": 1,
        "question_type": "bar_chart",
        "topic": "Cambridge IELTS 21 Academic",
        "title": "Cambridge IELTS 21 Academic Writing Test 01",
        "prompt": "The chart below shows visitor numbers.",
        "image_path": "data/writing-packs/cambridge-academic_Book_21/Test_01/images/chart.png",
        "visual_data": {"image_only": True, "extra_images": []},
        "source_type": "imported_original",
        "publication_status": "published",
        "book_id": "cambridge-academic-book-21",
        "book_title": "Cambridge IELTS 21 Academic",
        "test_number": 1,
        "pack_test_id": "cambridge-academic-book-21-test-01",
    }
    rec = record_from_bank_item(item, force_status="published")
    assert rec["visual_data"]["image_only"] is True
    assert rec["book_id"] == "cambridge-academic-book-21"
    result = import_records(db, [item], force_status="published", detect_duplicates=False)
    assert result["imported"] == 1
    q = db.query(WritingQuestion).filter_by(public_id=item["id"]).first()
    assert q.pack_test_id == item["pack_test_id"]
    assert q.image_path.endswith("chart.png")


def test_writing_catalog_groups_books(client, db):
    t1 = _seed_question(
        db,
        public_id="CAM-T1",
        prompt="The bar chart below shows transport use in two cities.",
    )
    t1.book_id = "cambridge-academic-book-21"
    t1.book_title = "Cambridge IELTS 21 Academic"
    t1.test_number = 1
    t1.pack_test_id = "cambridge-academic-book-21-test-01"
    t2 = _seed_question(
        db,
        public_id="CAM-T2",
        task_number=2,
        question_type="agree_disagree",
        prompt="Some people think cities should have more parks.",
        minimum_words=250,
        visual_data=None,
    )
    t2.book_id = "cambridge-academic-book-21"
    t2.book_title = "Cambridge IELTS 21 Academic"
    t2.test_number = 1
    t2.pack_test_id = "cambridge-academic-book-21-test-01"
    db.commit()
    res = client.get("/api/writing/catalog", params={"test_type": "academic"})
    assert res.status_code == 200
    tests = res.json()["tests"]
    packed = [row for row in tests if row["id"] == "cambridge-academic-book-21-test-01"]
    assert packed
    assert packed[0]["book_title"] == "Cambridge IELTS 21 Academic"
    assert {p["part_number"] for p in packed[0]["parts"]} == {1, 2}
    mock = client.post(
        "/api/writing/mock-tests",
        json={"test_type": "academic", "task1_id": t1.id, "task2_id": t2.public_id},
    )
    assert mock.status_code == 200
    assert mock.json()["task1"]["question"]["id"] == t1.id
    assert mock.json()["task2"]["question"]["id"] == t2.id
