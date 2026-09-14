from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class MockLibraryItem(Base):
    __tablename__ = "mock_library_items"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=False)
    mock_type = Column(String, nullable=False, index=True)
    ielts_type = Column(String, nullable=False, default="academic")
    question_count = Column(Integer, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    paper_refs_json = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def paper_refs(self) -> dict:
        try:
            return json.loads(self.paper_refs_json or "{}")
        except json.JSONDecodeError:
            return {}

    @paper_refs.setter
    def paper_refs(self, value: dict):
        self.paper_refs_json = json.dumps(value or {})


class MockAssignment(Base):
    __tablename__ = "mock_assignments"

    id = Column(String, primary_key=True, default=_uuid)
    library_item_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    mock_type = Column(String, nullable=False)
    ielts_type = Column(String, nullable=False, default="academic")
    assign_mode = Column(String, nullable=False, default="batch")
    batch_id = Column(String, nullable=True, index=True)
    batch_label = Column(String, nullable=True, index=True)
    available_at = Column(DateTime, nullable=True)
    deadline_at = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=False, default=60)
    attempts_allowed = Column(Integer, nullable=False, default=1)
    secure_mode = Column(Boolean, default=False)
    screen_monitoring = Column(Boolean, default=False)
    fullscreen_required = Column(Boolean, default=False)
    allow_late_start = Column(Boolean, default=True)
    auto_submit = Column(Boolean, default=True)
    paper_source = Column(String, nullable=False, default="bank")  # bank|manual
    result_mode = Column(String, nullable=False, default="teacher")  # teacher|ai
    instructions = Column(Text, nullable=True)
    paper_refs_json = Column(Text, nullable=True)
    created_by = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def paper_refs(self) -> dict:
        try:
            return json.loads(self.paper_refs_json or "{}")
        except json.JSONDecodeError:
            return {}

    @paper_refs.setter
    def paper_refs(self, value: dict):
        self.paper_refs_json = json.dumps(value or {})


class MockAssignmentStudent(Base):
    __tablename__ = "mock_assignment_students"

    id = Column(String, primary_key=True, default=_uuid)
    assignment_id = Column(String, nullable=False, index=True)
    student_id = Column(String, nullable=False, index=True)
    student_name = Column(String, nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="assigned", index=True)
    cancelled = Column(Boolean, default=False)
    flagged = Column(Boolean, default=False)
    available_at = Column(DateTime, nullable=True)
    deadline_at = Column(DateTime, nullable=True)


class MockAttempt(Base):
    __tablename__ = "mock_attempts"

    id = Column(String, primary_key=True, default=_uuid)
    assignment_student_id = Column(String, nullable=False, index=True)
    assignment_id = Column(String, nullable=False, index=True)
    student_id = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    current_section = Column(String, nullable=True)
    current_question = Column(Integer, nullable=True)
    question_total = Column(Integer, nullable=True)
    remaining_seconds = Column(Integer, nullable=True)
    warning_count = Column(Integer, nullable=False, default=0)
    skill_ref_json = Column(Text, nullable=True)
    listening_band = Column(Float, nullable=True)
    reading_band = Column(Float, nullable=True)
    writing_band = Column(Float, nullable=True)
    speaking_band = Column(Float, nullable=True)
    overall_band = Column(Float, nullable=True)
    writing_feedback = Column(Text, nullable=True)
    published = Column(Boolean, default=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow)
    paused = Column(Boolean, default=False)
    screen_share_active = Column(Boolean, default=False)
    last_warning = Column(String, nullable=True)
    connection_status = Column(String, nullable=True)

    @property
    def skill_ref(self) -> dict:
        try:
            return json.loads(self.skill_ref_json or "{}")
        except json.JSONDecodeError:
            return {}

    @skill_ref.setter
    def skill_ref(self, value: dict):
        self.skill_ref_json = json.dumps(value or {})


class MockAnswer(Base):
    __tablename__ = "mock_answers"

    id = Column(String, primary_key=True, default=_uuid)
    attempt_id = Column(String, nullable=False, index=True)
    section = Column(String, nullable=True)
    question_key = Column(String, nullable=False)
    value_json = Column(Text, nullable=True)
    client_seq = Column(Integer, nullable=True)
    saved_at = Column(DateTime, default=datetime.utcnow)


class MockIntegrityEvent(Base):
    __tablename__ = "mock_integrity_events"

    id = Column(String, primary_key=True, default=_uuid)
    attempt_id = Column(String, nullable=False, index=True)
    student_id = Column(String, nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TeacherMockAction(Base):
    __tablename__ = "teacher_mock_actions"

    id = Column(String, primary_key=True, default=_uuid)
    teacher_id = Column(String, nullable=True, index=True)
    assignment_id = Column(String, nullable=True, index=True)
    attempt_id = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LmsNotification(Base):
    __tablename__ = "lms_notifications"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False, default="student")
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    href = Column(String, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
