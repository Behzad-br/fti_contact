"""Reading attempt storage."""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ReadingAttempt(Base):
    __tablename__ = "reading_attempts"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=False, index=True, default="local")
    test_id = Column(String, nullable=False, index=True)
    test_type = Column(String, nullable=False, index=True)
    mode = Column(String, nullable=False, default="full_mock")  # full_mock | single_passage | question_type
    timed = Column(Integer, nullable=False, default=1)
    duration_seconds = Column(Integer, nullable=False, default=3600)
    remaining_seconds = Column(Integer, nullable=True)
    scope_json = Column(Text, nullable=True)
    snapshot_json = Column(Text, nullable=True)
    responses_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    estimated_band = Column(Float, nullable=True)
    raw_score = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)

    @property
    def responses(self) -> dict:
        if not self.responses_json:
            return {}
        try:
            return json.loads(self.responses_json)
        except json.JSONDecodeError:
            return {}

    @responses.setter
    def responses(self, value: dict):
        self.responses_json = json.dumps(value or {})

    @property
    def scope(self) -> dict:
        if not self.scope_json:
            return {}
        try:
            return json.loads(self.scope_json)
        except json.JSONDecodeError:
            return {}

    @scope.setter
    def scope(self, value: dict):
        self.scope_json = json.dumps(value or {})

    @property
    def snapshot(self) -> dict | None:
        if not self.snapshot_json:
            return None
        try:
            return json.loads(self.snapshot_json)
        except json.JSONDecodeError:
            return None

    @snapshot.setter
    def snapshot(self, value: dict | None):
        self.snapshot_json = json.dumps(value) if value is not None else None

    @property
    def result(self) -> dict | None:
        if not self.result_json:
            return None
        try:
            return json.loads(self.result_json)
        except json.JSONDecodeError:
            return None

    @result.setter
    def result(self, value: dict | None):
        self.result_json = json.dumps(value) if value is not None else None
