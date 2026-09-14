"""Listening attempt storage."""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ListeningAttempt(Base):
    __tablename__ = "listening_attempts"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=False, index=True, default="local")
    test_id = Column(String, nullable=False, index=True)
    mode = Column(String, nullable=False, default="full_mock")
    timed = Column(Integer, nullable=False, default=1)
    duration_seconds = Column(Integer, nullable=False, default=1800)
    remaining_seconds = Column(Integer, nullable=True)
    scope_json = Column(Text, nullable=True)
    snapshot_json = Column(Text, nullable=True)
    responses_json = Column(Text, nullable=True)
    playback_json = Column(Text, nullable=True)
    result_json = Column(Text, nullable=True)
    estimated_band = Column(Float, nullable=True)
    raw_score = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)

    def _load(self, raw: str | None, default):
        if not raw:
            return default
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default

    @property
    def responses(self) -> dict:
        return self._load(self.responses_json, {})

    @responses.setter
    def responses(self, value: dict):
        self.responses_json = json.dumps(value or {})

    @property
    def scope(self) -> dict:
        return self._load(self.scope_json, {})

    @scope.setter
    def scope(self, value: dict):
        self.scope_json = json.dumps(value or {})

    @property
    def snapshot(self) -> dict | None:
        return self._load(self.snapshot_json, None)

    @snapshot.setter
    def snapshot(self, value: dict | None):
        self.snapshot_json = json.dumps(value) if value is not None else None

    @property
    def playback(self) -> dict:
        return self._load(self.playback_json, {})

    @playback.setter
    def playback(self, value: dict):
        self.playback_json = json.dumps(value or {})

    @property
    def result(self) -> dict | None:
        return self._load(self.result_json, None)

    @result.setter
    def result(self, value: dict | None):
        self.result_json = json.dumps(value) if value is not None else None
