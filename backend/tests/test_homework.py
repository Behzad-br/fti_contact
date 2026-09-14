"""Homework assignment uses the same pack tests students practise."""
import pytest

from app.homework.controllers import _open_skill
from app.homework.models import HomeworkAssignment
from app.writing.models import WritingAttempt, WritingMockSession, WritingQuestion


def _question(db, **kwargs):
    q = WritingQuestion(
        public_id=kwargs["public_id"],
        test_type="academic",
        task_number=kwargs["task_number"],
        question_type="bar_chart" if kwargs["task_number"] == 1 else "opinion",
        topic="transport",
        prompt=kwargs["prompt"],
        minimum_words=150 if kwargs["task_number"] == 1 else 250,
        recommended_minutes=20 if kwargs["task_number"] == 1 else 40,
        status="published",
        is_permanent_bank=True,
        source_type="original_generated",
    )
    db.add(q)
    db.flush()
    return q


@pytest.mark.asyncio
async def test_writing_full_mock_homework_uses_pack_question_ids(db):
    q1 = _question(db, public_id="HW-T1-001", task_number=1, prompt="The chart shows buses.")
    q2 = _question(db, public_id="HW-T2-001", task_number=2, prompt="Some people prefer buses.")
    db.commit()
    row = HomeworkAssignment(
        title="Cambridge pack mock",
        module="writing",
        scope="full_mock",
        source="bank",
        task_label="Full Mock",
    )
    row.payload = {"task1_id": q1.id, "task2_id": q2.id, "test_type": "academic"}
    db.add(row)
    db.commit()

    result = await _open_skill(db, row, "student-hw")
    assert result["kind"] == "writing-mock"
    mock = db.query(WritingMockSession).filter_by(id=result["mockId"]).one()
    a1 = db.query(WritingAttempt).filter_by(id=mock.task1_attempt_id).one()
    a2 = db.query(WritingAttempt).filter_by(id=mock.task2_attempt_id).one()
    assert a1.question_id == q1.id
    assert a2.question_id == q2.id
