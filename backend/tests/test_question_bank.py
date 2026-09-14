"""
tests/test_question_bank.py — Test question bank loading and validation.
"""
import pytest
from app.speaking.services.question_bank import list_tests, get_test, validate_test, get_random_test


def test_list_tests_returns_list():
    tests = list_tests()
    assert isinstance(tests, list)
    assert len(tests) >= 10  # We have 10 seed tests


def test_list_tests_have_id_and_title():
    tests = list_tests()
    for t in tests:
        assert "id" in t
        assert "title" in t


def test_get_test_by_id():
    test = get_test("test-001")
    assert test is not None
    assert test["id"] == "test-001"
    assert "part1" in test
    assert "part2" in test
    assert "part3" in test


def test_get_test_invalid_id_returns_none():
    test = get_test("nonexistent-test-abc")
    assert test is None


def test_get_random_test_returns_test():
    test = get_random_test()
    assert test is not None
    assert "id" in test


def test_validate_test_valid():
    test = {
        "id": "t-001",
        "title": "Test",
        "part1": ["Q1", "Q2", "Q3", "Q4", "Q5"],
        "part2": {"topic": "Describe something", "bullets": ["b1", "b2", "b3"]},
        "part3": ["P3Q1", "P3Q2", "P3Q3", "P3Q4", "P3Q5"],
    }
    valid, err = validate_test(test)
    assert valid is True
    assert err == ""


def test_validate_test_missing_id():
    test = {
        "title": "Test",
        "part1": ["Q1", "Q2", "Q3"],
        "part2": {"topic": "Topic", "bullets": ["b1", "b2"]},
        "part3": ["P1", "P2", "P3"],
    }
    valid, err = validate_test(test)
    assert valid is False
    assert "id" in err


def test_validate_test_part1_too_short():
    test = {
        "id": "t-001",
        "title": "Test",
        "part1": ["Q1", "Q2"],  # Only 2 questions
        "part2": {"topic": "Topic", "bullets": ["b1", "b2"]},
        "part3": ["P1", "P2", "P3"],
    }
    valid, err = validate_test(test)
    assert valid is False
    assert "part1" in err


def test_validate_test_part2_missing_topic():
    test = {
        "id": "t-001",
        "title": "Test",
        "part1": ["Q1", "Q2", "Q3"],
        "part2": {"bullets": ["b1", "b2"]},  # Missing topic
        "part3": ["P1", "P2", "P3"],
    }
    valid, err = validate_test(test)
    assert valid is False
    assert "topic" in err


def test_all_seed_tests_are_valid():
    from app.speaking.services.question_bank import _load_bank
    bank = _load_bank()
    for test in bank:
        valid, err = validate_test(test)
        assert valid, f"Test '{test.get('id')}' failed validation: {err}"
