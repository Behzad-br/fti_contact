from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, String, Text

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class HomeworkAssignment(Base):
    __tablename__ = "homework_assignments"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    module = Column(String, nullable=False, index=True)  # writing|reading|speaking|listening
    scope = Column(String, nullable=False, default="piece")  # piece|full_mock
    source = Column(String, nullable=False, default="bank")  # bank|ai|manual
    task_label = Column(String, nullable=True)
    question_type = Column(String, nullable=True)
    batch_label = Column(String, nullable=True, index=True)
    student_ids_json = Column(Text, nullable=True)
    deadline = Column(DateTime, nullable=True)
    timed = Column(String, default="1")
    ai_grading_enabled = Column(String, default="0")
    payload_json = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def student_ids(self) -> list[str]:
        try:
            return json.loads(self.student_ids_json or "[]")
        except json.JSONDecodeError:
            return []

    @student_ids.setter
    def student_ids(self, value: list[str]):
        self.student_ids_json = json.dumps(value or [])

    @property
    def payload(self) -> dict:
        try:
            return json.loads(self.payload_json or "{}")
        except json.JSONDecodeError:
            return {}

    @payload.setter
    def payload(self, value: dict):
        self.payload_json = json.dumps(value or {})


class HomeworkSubmission(Base):
    __tablename__ = "homework_submissions"

    id = Column(String, primary_key=True, default=_uuid)
    assignment_id = Column(String, nullable=False, index=True)
    student_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    attempt_kind = Column(String, nullable=True)
    attempt_ref = Column(String, nullable=True)
    estimated_band = Column(Float, nullable=True)
    teacher_band = Column(Float, nullable=True)
    teacher_comments = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
