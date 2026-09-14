from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class ClassNote(Base):
    __tablename__ = "class_notes"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    page_count = Column(Integer, nullable=False, default=1)
    unlocked_batches_json = Column(Text, nullable=True)
    unlocked_student_ids_json = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def unlocked_batches(self) -> list[str]:
        try:
            return json.loads(self.unlocked_batches_json or "[]")
        except json.JSONDecodeError:
            return []

    @unlocked_batches.setter
    def unlocked_batches(self, value: list[str]):
        self.unlocked_batches_json = json.dumps(value or [])

    @property
    def unlocked_student_ids(self) -> list[str]:
        try:
            return json.loads(self.unlocked_student_ids_json or "[]")
        except json.JSONDecodeError:
            return []

    @unlocked_student_ids.setter
    def unlocked_student_ids(self, value: list[str]):
        self.unlocked_student_ids_json = json.dumps(value or [])
