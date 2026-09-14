"""Parser tests for authorized reading pack HTML."""
from bs4 import BeautifulSoup

from app.reading.services.scoring import is_correct
from app.reading_pack_import import book_title, infer_track, parse_passages, parse_questions

HTML = """
<div class="ielts-reading-transcript" data-part-number="1" id="ielts-reading-transcript-1">
  <p><em>You should spend about 20 minutes on Questions 1-7, which are based on Reading Passage 1 below.</em></p>
  <p class="ielts-reading-passage-subhead"><strong>The Davies Sisters</strong></p>
  <p>Between 1908 and 1924 the sisters collected French paintings.</p>
  <p>A Their grandfather made money in mining.</p>
</div>
<div class="ielts-reading-question-section" data-part-number="1" id="ielts-reading-question-section-1">
  <h2 class="ielts-reading-question-section-heading">Questions 1-2 Practice this section only</h2>
  <div class="ielts-reading-question-section-content">
    <p>Complete the notes below.</p>
    <p>Choose ONE WORD ONLY from the passage for each answer.</p>
  </div>
  <ul>
    <li>wealth came from <span class="ielts-reading-question-item"><strong class="ielts-reading-question-number" id="ielts-reading-question-number-1">1</strong> <input type="text"/></span> and shipping</li>
  </ul>
</div>
<div class="ielts-reading-question-section" data-part-number="1">
  <h2 class="ielts-reading-question-section-heading">Questions 2-2</h2>
  <div class="ielts-reading-question-section-content"><p>Do the following statements agree with the information?</p></div>
  <div class="ielts-reading-question-item">
    <span><strong class="ielts-reading-question-number" id="ielts-reading-question-number-2">2</strong> The sisters lived in Wales.</span>
    <div class="ielts-reading-option"><label class="ielts-reading-option-letter">A</label><input type="radio" value="TRUE"/><span>TRUE</span></div>
    <div class="ielts-reading-option"><label class="ielts-reading-option-letter">B</label><input type="radio" value="FALSE"/><span>FALSE</span></div>
    <div class="ielts-reading-option"><label class="ielts-reading-option-letter">C</label><input type="radio" value="NOT GIVEN"/><span>NOT GIVEN</span></div>
  </div>
</div>
"""

KEY = [
    {
        "question": 1,
        "correct_answer": "mining",
        "question_type": "note_completion",
        "explanation": "Excerpt/Passage Explanation:\nHe worked in mining.\nAnswer Explanation:\nThe missing word is mining.",
    },
    {"question": 2, "correct_answer": "TRUE", "question_type": "true_false_notgiven", "explanation": ""},
]


def test_infer_track_and_titles():
    assert infer_track("Reading_cambridge-academic_Book_21.zip") == "academic"
    assert infer_track("Reading_cambridge-general_Book_18.zip") == "general_training"
    assert "Cambridge IELTS 21 Academic" in book_title("cambridge-academic_Book_21", track="academic")


def test_parse_notes_and_tfng():
    soup = BeautifulSoup(HTML, "html.parser")
    passages = parse_passages(soup, "demo-reading-test-01")
    questions = parse_questions(soup, KEY, test_id="demo-reading-test-01", test_type="academic")
    assert passages[0]["title"] == "The Davies Sisters"
    assert questions[0]["type"] == "note_completion"
    assert "shipping" in questions[0]["prompt"]
    assert "options" not in questions[0]
    assert questions[0]["accepted_answers"] == ["mining"]
    assert questions[0]["evidence"]
    assert questions[1]["type"] == "true_false_not_given"
    assert "options" not in questions[1]
    assert is_correct(questions[1], "True")
    assert is_correct(questions[1], "T")
