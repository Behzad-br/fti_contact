"""Class notes lock/unlock and student page access."""
from io import BytesIO

from app.notes.models import ClassNote


MIN_PDF = (
    b"%PDF-1.1\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
)


def _pdf_file():
    return ("notes.pdf", BytesIO(MIN_PDF), "application/pdf")


def test_student_cannot_read_locked_notes(client, monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(settings, "NOTES_DIR", str(tmp_path))
    monkeypatch.setattr("app.notes.controllers.inspect_document", lambda path: 2)
    monkeypatch.setattr("app.notes.controllers.render_page", lambda path, page, mark: b"png-bytes")

    created = client.post(
        "/api/notes/teacher",
        data={"title": "Writing vocabulary", "description": "Week 1"},
        files={"file": _pdf_file()},
    )
    assert created.status_code == 200, created.text
    note_id = created.json()["id"]

    locked = client.get(
        f"/api/notes/student/{note_id}/page/1",
        headers={"X-Student-Id": "s1", "X-Student-Batch": "Morning Batch A"},
    )
    assert locked.status_code == 403

    access = client.put(
        f"/api/notes/teacher/{note_id}/access",
        json={"unlocked_batches": ["Morning Batch A"], "unlocked_student_ids": []},
    )
    assert access.status_code == 200
    assert "Morning Batch A" in access.json()["unlocked_batches"]

    page = client.get(
        f"/api/notes/student/{note_id}/page/1",
        headers={"X-Student-Id": "s1", "X-Student-Batch": "Morning Batch A", "X-Student-Name": "Ali Ahmad"},
    )
    assert page.status_code == 200
    assert page.headers["content-type"] == "image/png"
    assert page.content == b"png-bytes"

    other = client.get(
        f"/api/notes/student/{note_id}/page/1",
        headers={"X-Student-Id": "s3", "X-Student-Batch": "Morning Batch B"},
    )
    assert other.status_code == 403


def test_unlock_specific_student(client, monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(settings, "NOTES_DIR", str(tmp_path))
    monkeypatch.setattr("app.notes.controllers.inspect_document", lambda path: 1)
    monkeypatch.setattr("app.notes.controllers.render_page", lambda path, page, mark: b"ok")

    created = client.post(
        "/api/notes/teacher",
        data={"title": "Speaking cues"},
        files={"file": _pdf_file()},
    )
    note_id = created.json()["id"]
    client.put(
        f"/api/notes/teacher/{note_id}/access",
        json={"unlocked_batches": [], "unlocked_student_ids": ["s2"]},
    )
    denied = client.get(
        f"/api/notes/student/{note_id}",
        headers={"X-Student-Id": "s1", "X-Student-Batch": "Morning Batch A"},
    )
    assert denied.status_code == 403
    allowed = client.get(
        f"/api/notes/student/{note_id}",
        headers={"X-Student-Id": "s2", "X-Student-Batch": "Morning Batch A"},
    )
    assert allowed.status_code == 200
    listed = client.get("/api/notes/student", headers={"X-Student-Id": "s2", "X-Student-Batch": "Morning Batch A"})
    assert listed.json()["notes"][0]["unlocked"] is True


def test_upload_text_document(client, monkeypatch, tmp_path):
    from app.config import settings

    monkeypatch.setattr(settings, "NOTES_DIR", str(tmp_path))
    created = client.post(
        "/api/notes/teacher",
        data={"title": "Linking words", "description": "Plain text"},
        files={"file": ("linking-words.txt", BytesIO(b"However\nTherefore\nIn addition"), "text/plain")},
    )
    assert created.status_code == 200, created.text
    assert created.json()["kind"] == "txt"
    assert created.json()["page_count"] >= 1

    rejected = client.post(
        "/api/notes/teacher",
        data={"title": "Bad file"},
        files={"file": ("virus.exe", BytesIO(b"MZ"), "application/octet-stream")},
    )
    assert rejected.status_code == 400
