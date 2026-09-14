from pathlib import Path

from app.saved_page_ingest import html_to_text, ingest_raw_folder, reading_test_from_text


SAMPLE = """
<title>Academic Reading Practice Test</title>
<h1>Reading Passage 1</h1>
<p>A. Coastal towns began a trial in 2018 to measure heat on dark roofs.</p>
<p>B. Researchers compared planted plots with bare roofs over twelve weeks.</p>
<h2>Questions 1-2</h2>
<p>Choose the correct letter, A, B, C or D.</p>
<p>1. In which year did the trial begin?</p>
<p>A. 2017</p>
<p>B. 2018</p>
<p>C. 2019</p>
<p>D. 2020</p>
<p>2. The comparison lasted for</p>
<p>Answers</p>
<p>1. B</p>
<p>2. twelve weeks</p>
"""


def test_reading_parser_extracts_mcq_and_answers():
    title, body = html_to_text(SAMPLE)
    test = reading_test_from_text("demo-page", title or "Academic Reading Practice Test", body)
    assert test["id"].startswith("imported-reading-")
    assert test["passages"]
    assert {q["number"] for q in test["questions"]} >= {1, 2}
    q1 = next(q for q in test["questions"] if q["number"] == 1)
    assert q1["type"] == "multiple_choice"
    assert q1["answer"] == "B"
    assert len(q1["options"]) == 4


def test_ingest_writes_json(tmp_path: Path):
    raw = tmp_path / "raw"
    reading = tmp_path / "reading"
    listening = tmp_path / "listening"
    raw.mkdir()
    (raw / "demo-page.html").write_text(SAMPLE, encoding="utf-8")
    written = ingest_raw_folder(raw, reading, listening)
    assert len(written) == 1
    assert written[0].parent == reading
    assert written[0].exists()
