"""
SQLAlchemy models for the IELTS Writing module.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _json_load(raw, default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return default


class WritingQuestion(Base):
    __tablename__ = "writing_questions"

    id = Column(String, primary_key=True, default=_uuid)
    public_id = Column(String, unique=True, index=True, nullable=False)
    test_type = Column(String, nullable=False, index=True)  # academic | general_training
    task_number = Column(Integer, nullable=False, index=True)  # 1 | 2
    question_type = Column(String, nullable=False, index=True)
    topic = Column(String, nullable=True, index=True)
    difficulty = Column(String, nullable=True, index=True)
    title = Column(String, nullable=True)
    prompt = Column(Text, nullable=False)
    instructions = Column(Text, nullable=True)
    minimum_words = Column(Integer, nullable=False, default=150)
    recommended_minutes = Column(Integer, nullable=False, default=20)
    visual_data_json = Column(Text, nullable=True)
    image_path = Column(String, nullable=True)
    book_id = Column(String, nullable=True, index=True)
    book_title = Column(String, nullable=True)
    test_number = Column(Integer, nullable=True)
    pack_test_id = Column(String, nullable=True, index=True)
    letter_tone = Column(String, nullable=True)
    recipient = Column(String, nullable=True)
    bullet_points_json = Column(Text, nullable=True)
    planning_tags_json = Column(Text, nullable=True)
    source_type = Column(String, nullable=False, default="original_generated", index=True)
    source_reference = Column(String, nullable=True)
    generated_by_ai = Column(Boolean, default=False)
    generated_by = Column(String, nullable=True)
    reviewed_by = Column(String, nullable=True)
    status = Column(String, nullable=False, default="review", index=True)
    is_permanent_bank = Column(Boolean, default=True, index=True)
    duplicate_flag = Column(Boolean, default=False)
    duplicate_of_id = Column(String, nullable=True)
    teacher_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    attempts = relationship("WritingAttempt", back_populates="question")
    bookmarks = relationship("WritingBookmark", back_populates="question", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_writing_q_filter", "test_type", "task_number", "status", "is_permanent_bank"),
        Index("ix_writing_q_type_diff", "question_type", "difficulty"),
    )

    @property
    def visual_data(self):
        return _json_load(self.visual_data_json, None)

    @visual_data.setter
    def visual_data(self, value):
        self.visual_data_json = json.dumps(value) if value is not None else None

    @property
    def bullet_points(self):
        return _json_load(self.bullet_points_json, [])

    @bullet_points.setter
    def bullet_points(self, value):
        self.bullet_points_json = json.dumps(value) if value else None

    @property
    def planning_tags(self):
        return _json_load(self.planning_tags_json, [])

    @planning_tags.setter
    def planning_tags(self, value):
        self.planning_tags_json = json.dumps(value) if value else None


class WritingGeneration(Base):
    __tablename__ = "writing_generations"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=True, index=True)
    question_id = Column(String, ForeignKey("writing_questions.id"), nullable=True)
    test_type = Column(String, nullable=False)
    task_number = Column(Integer, nullable=False)
    question_type = Column(String, nullable=True)
    topic = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)
    parameters_json = Column(Text, nullable=True)
    prompt = Column(Text, nullable=True)
    structured_data_json = Column(Text, nullable=True)
    ai_model = Column(String, nullable=True)
    saved_to_bank = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("WritingQuestion")


class WritingMockSession(Base):
    __tablename__ = "writing_mock_sessions"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=False, index=True)
    test_type = Column(String, nullable=False)
    assignment_id = Column(String, ForeignKey("writing_assignments.id"), nullable=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    duration_seconds = Column(Integer, nullable=False, default=3600)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    locked = Column(Boolean, default=False)
    task1_attempt_id = Column(String, nullable=True)
    task2_attempt_id = Column(String, nullable=True)
    task1_band = Column(Float, nullable=True)
    task2_band = Column(Float, nullable=True)
    overall_band = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    attempts = relationship("WritingAttempt", back_populates="mock_session")


class WritingAttempt(Base):
    __tablename__ = "writing_attempts"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=False, index=True)
    question_id = Column(String, ForeignKey("writing_questions.id"), nullable=False, index=True)
    mock_session_id = Column(String, ForeignKey("writing_mock_sessions.id"), nullable=True, index=True)
    assignment_id = Column(String, ForeignKey("writing_assignments.id"), nullable=True)
    answer_text = Column(Text, nullable=True, default="")
    submitted_text = Column(Text, nullable=True)
    word_count = Column(Integer, nullable=True, default=0)
    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    time_spent_seconds = Column(Integer, nullable=True, default=0)
    timer_mode = Column(String, nullable=True, default="countup")
    status = Column(String, nullable=False, default="in_progress", index=True)
    is_ai_generated_question = Column(Boolean, default=False)
    attempt_number = Column(Integer, default=1)
    estimated_band = Column(Float, nullable=True)
    teacher_band = Column(Float, nullable=True)
    final_band = Column(Float, nullable=True)
    grading_version = Column(String, nullable=True)
    ai_model_used = Column(String, nullable=True)
    grading_json = Column(Text, nullable=True)
    teacher_feedback_json = Column(Text, nullable=True)
    teacher_comments = Column(Text, nullable=True)
    grading_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    question = relationship("WritingQuestion", back_populates="attempts")
    mock_session = relationship("WritingMockSession", back_populates="attempts")
    revisions = relationship("WritingAttemptRevision", back_populates="attempt", cascade="all, delete-orphan")
    model_answers = relationship("WritingModelAnswer", back_populates="attempt", cascade="all, delete-orphan")

    @property
    def grading(self):
        return _json_load(self.grading_json, None)

    @grading.setter
    def grading(self, value):
        self.grading_json = json.dumps(value) if value is not None else None

    @property
    def teacher_feedback(self):
        return _json_load(self.teacher_feedback_json, None)

    @teacher_feedback.setter
    def teacher_feedback(self, value):
        self.teacher_feedback_json = json.dumps(value) if value is not None else None


class WritingAttemptRevision(Base):
    __tablename__ = "writing_attempt_revisions"

    id = Column(String, primary_key=True, default=_uuid)
    attempt_id = Column(String, ForeignKey("writing_attempts.id"), nullable=False, index=True)
    actor = Column(String, nullable=True)
    action = Column(String, nullable=False)
    snapshot_text = Column(Text, nullable=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    attempt = relationship("WritingAttempt", back_populates="revisions")


class WritingBookmark(Base):
    __tablename__ = "writing_bookmarks"

    id = Column(String, primary_key=True, default=_uuid)
    student_id = Column(String, nullable=False, index=True)
    question_id = Column(String, ForeignKey("writing_questions.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("WritingQuestion", back_populates="bookmarks")

    __table_args__ = (Index("ix_writing_bookmark_unique", "student_id", "question_id", unique=True),)


class WritingAssignment(Base):
    __tablename__ = "writing_assignments"

    id = Column(String, primary_key=True, default=_uuid)
    title = Column(String, nullable=True)
    student_id = Column(String, nullable=True, index=True)
    batch_label = Column(String, nullable=True, index=True)
    question_id = Column(String, ForeignKey("writing_questions.id"), nullable=True)
    mock_test_type = Column(String, nullable=True)
    deadline = Column(DateTime, nullable=True)
    timed = Column(Boolean, default=True)
    ai_grading_enabled = Column(Boolean, default=True)
    lock_after_deadline = Column(Boolean, default=True)
    allow_late = Column(Boolean, default=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("WritingQuestion")


class WritingModelAnswer(Base):
    __tablename__ = "writing_model_answers"

    id = Column(String, primary_key=True, default=_uuid)
    attempt_id = Column(String, ForeignKey("writing_attempts.id"), nullable=False, index=True)
    question_id = Column(String, ForeignKey("writing_questions.id"), nullable=True)
    band_style = Column(Integer, nullable=False)  # 7 | 8 | 9
    text = Column(Text, nullable=False)
    ai_model = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    attempt = relationship("WritingAttempt", back_populates="model_answers")


class WritingAiUsage(Base):
    __tablename__ = "writing_ai_usage"

    id = Column(String, primary_key=True, default=_uuid)
    request_type = Column(String, nullable=False, index=True)
    model = Column(String, nullable=True)
    student_id = Column(String, nullable=True)
    success = Column(Boolean, default=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WritingAppSetting(Base):
    __tablename__ = "writing_app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
