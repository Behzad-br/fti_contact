"""
models/schemas.py — Pydantic schemas for API request/response validation.
"""
from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ─────────────────────────── Request schemas ──────────────────────────────────

class StartTestRequest(BaseModel):
    mode: str = Field(..., description="'stored' or 'fresh'")
    test_id: Optional[str] = Field(None, description="For stored mode: test ID from question bank")
    practice_part: Optional[int] = Field(
        None,
        ge=1,
        le=3,
        description="1, 2, or 3 to practice one IELTS part. Omit for a full mock test.",
    )


# ─────────────────────────── Response schemas ─────────────────────────────────

class CueCardSchema(BaseModel):
    topic: str
    bullets: List[str]


class QuestionSchema(BaseModel):
    id: str
    part: int
    order_idx: int
    question_text: str
    cue_card: Optional[CueCardSchema] = None


class NextStepSchema(BaseModel):
    """Returned after submitting an answer — tells the frontend what to do next."""
    action: str                           # "next_question" | "complete"
    question: Optional[QuestionSchema] = None
    session_id: str
    part: Optional[int] = None
    question_number: Optional[int] = None
    total_questions: Optional[int] = None


class StartTestResponse(BaseModel):
    session_id: str
    mode: str
    title: str
    practice_part: Optional[int] = None
    first_question: QuestionSchema
    total_part1: int
    total_part2: int = 1
    total_part3: int


class AnswerSubmitResponse(BaseModel):
    answer_id: str
    transcript: str
    duration: Optional[float] = None
    word_count: Optional[int] = None
    next_step: NextStepSchema


class AnswerIssueSchema(BaseModel):
    original: str
    better: str


class AnswerReviewSchema(BaseModel):
    part: int
    question_text: str
    transcript: str
    duration: Optional[float] = None
    word_count: Optional[int] = None
    relevance_score: Optional[float] = None
    relevance_label: Optional[str] = None
    relevance_note: Optional[str] = None
    answer_band: Optional[float] = None
    examiner_note: Optional[str] = None
    mark_cuts: List[str] = []
    issues: List[AnswerIssueSchema] = []


class EvaluationSchema(BaseModel):
    fluency_coherence: Optional[float]
    lexical_resource: Optional[float]
    grammar: Optional[float]
    task_relevance: Optional[float] = None
    pronunciation: str = "Not assessed in this version"
    estimated_band: Optional[float]
    strengths: List[str] = []
    weaknesses: List[str] = []
    corrections: List[dict] = []
    why_this_band: List[str] = []
    better_versions: List[dict] = []
    detailed_feedback: Optional[str]
    part1_feedback: Optional[str]
    part2_feedback: Optional[str]
    part3_feedback: Optional[str]
    improvement_tips: Optional[str]
    ai_status: Optional[str] = None


class SessionResultSchema(BaseModel):
    session_id: str
    mode: str
    title: Optional[str]
    practice_part: Optional[int] = None
    status: str
    estimated_band: Optional[float]
    started_at: datetime
    completed_at: Optional[datetime]
    evaluation: Optional[EvaluationSchema]
    answers: List[AnswerReviewSchema] = []


class HistoryItemSchema(BaseModel):
    session_id: str
    mode: str
    title: Optional[str]
    practice_part: Optional[int] = None
    estimated_band: Optional[float]
    started_at: datetime
    completed_at: Optional[datetime]
    status: str


class HistoryListSchema(BaseModel):
    sessions: List[HistoryItemSchema]
    total: int


class ProgressSchema(BaseModel):
    total_tests: int
    recent_bands: List[Optional[float]]
    average_band: Optional[float]
    recurring_grammar_issues: List[str]
    recurring_vocab_issues: List[str]


class HealthSchema(BaseModel):
    status: str
    database: bool
    minimax_configured: bool
    whisper_model: str
    app_name: str
