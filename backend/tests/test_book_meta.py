from app.book_meta import book_fields, books_from_tests


def test_cambridge_title_groups_into_one_book():
    a = book_fields({"id": "c19-t1", "title": "Cambridge IELTS 19 Academic Test 1"}, module="reading", track="academic")
    b = book_fields({"id": "c19-t2", "title": "Cambridge IELTS 19 Academic Test 2", "test_number": 2}, module="reading", track="academic")
    assert a["book_id"] == b["book_id"]
    assert "19" in a["book_title"]
    grouped = books_from_tests([{**{"id": "c19-t1", "title": "T1"}, **a}, {**{"id": "c19-t2", "title": "T2"}, **b}])
    assert len(grouped) == 1
    assert grouped[0]["test_count"] == 2
