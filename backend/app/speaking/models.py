"""Speaking ORM models — TestSession, Question, Answer, Evaluation."""
import json
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class TestSession(Base):
    __tablename__ = "test_sessions"

    id = Column(String, primary_key=True, default=_uuid)
    mode = Column(String, nullable=False)          # "stored" | "fresh"
    test_id = Column(String, nullable=True)        # e.g. "test-001" for stored tests
    title = Column(String, nullable=True)          # Human-readable title
    practice_part = Column(Integer, nullable=True) # 1/2/3 for single-part practice; None = full mock
    status = Column(String, default="in_progress") # "in_progress" | "completed" | "error"
    estimated_band = Column(Float, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    questions = relationship("Question", back_populates="session", cascade="all, delete-orphan")
    answers = relationship("Answer", back_populates="session", cascade="all, delete-orphan")
    evaluation = relationship("Evaluation", back_populates="session", uselist=False, cascade="all, delete-orphan")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, ForeignKey("test_sessions.id"), nullable=False)
    part = Column(Integer, nullable=False)          # 1, 2, or 3
    order_idx = Column(Integer, nullable=False)     # 0-based index within part
    question_text = Column(Text, nullable=False)
    cue_card_topic = Column(Text, nullable=True)    # Part 2 only
    cue_card_bullets_json = Column(Text, nullable=True)  # JSON list, Part 2 only

    session = relationship("TestSession", back_populates="questions")
    answer = relationship("Answer", back_populates="question", uselist=False)

    @property
    def cue_card_bullets(self) -> list:
        if self.cue_card_bullets_json:
            return json.loads(self.cue_card_bullets_json)
        return []

    @cue_card_bullets.setter
    def cue_card_bullets(self, value: list):
        self.cue_card_bullets_json = json.dumps(value) if value else None


class Answer(Base):
    __tablename__ = "answers"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, ForeignKey("test_sessions.id"), nullable=False)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    transcript = Column(Text, nullable=True)
    audio_duration = Column(Float, nullable=True)   # seconds
    word_count = Column(Integer, nullable=True)
    filler_count = Column(Integer, nullable=True)
    words_per_minute = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TestSession", back_populates="answers")
    question = relationship("Question", back_populates="answer")


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, ForeignKey("test_sessions.id"), unique=True, nullable=False)
    fluency_coherence = Column(Float, nullable=True)
    lexical_resource = Column(Float, nullable=True)
    grammar = Column(Float, nullable=True)
    pronunciation = Column(String, default="Not assessed in this version")
    estimated_band = Column(Float, nullable=True)
    strengths_json = Column(Text, nullable=True)       # JSON list
    weaknesses_json = Column(Text, nullable=True)      # JSON list
    corrections_json = Column(Text, nullable=True)     # JSON list of {original, better}
    detailed_feedback = Column(Text, nullable=True)
    part1_feedback = Column(Text, nullable=True)
    part2_feedback = Column(Text, nullable=True)
    part3_feedback = Column(Text, nullable=True)
    improvement_tips = Column(Text, nullable=True)
    raw_ai_response = Column(Text, nullable=True)      # Full MiniMax response for debugging
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("TestSession", back_populates="evaluation")

    @property
    def strengths(self) -> list:
        return json.loads(self.strengths_json) if self.strengths_json else []

    @strengths.setter
    def strengths(self, value: list):
        self.strengths_json = json.dumps(value)

    @property
    def weaknesses(self) -> list:
        return json.loads(self.weaknesses_json) if self.weaknesses_json else []

    @weaknesses.setter
    def weaknesses(self, value: list):
        self.weaknesses_json = json.dumps(value)

    @property
    def corrections(self) -> list:
        return json.loads(self.corrections_json) if self.corrections_json else []

    @corrections.setter
    def corrections(self, value: list):
        self.corrections_json = json.dumps(value)
