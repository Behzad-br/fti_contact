"""JSON serializers — the View layer for API responses."""
import json

from app.speaking.models import Evaluation, Question
from app.speaking.schemas import CueCardSchema, EvaluationSchema, QuestionSchema


def question_to_schema(q: Question) -> QuestionSchema:
    cue = None
    if q.part == 2 and q.cue_card_topic:
        cue = CueCardSchema(topic=q.cue_card_topic, bullets=q.cue_card_bullets)
    return QuestionSchema(
        id=q.id,
        part=q.part,
        order_idx=q.order_idx,
        question_text=q.question_text,
        cue_card=cue,
    )


def extras_from_evaluation(e: Evaluation) -> dict:
    extra: dict = {}
    try:
        parsed = json.loads(e.raw_ai_response or "{}")
        if isinstance(parsed, dict):
            extra = parsed
    except json.JSONDecodeError:
        extra = {}
    why = extra.get("why_this_band") or []
    if isinstance(why, str) and why.strip():
        why = [why.strip()]
    if not isinstance(why, list):
        why = []
    better = extra.get("better_versions") or extra.get("better_answer_snippets") or []
    if not isinstance(better, list):
        better = []
    status = extra.get("ai_status")
    if not status:
        status = "fallback" if extra.get("fallback") else ("insufficient" if extra.get("reason") == "insufficient_speech" else "ai")
    return {
        "why_this_band": [str(item).strip() for item in why if str(item).strip()],
        "better_versions": [item for item in better if isinstance(item, dict)],
        "ai_status": status,
        "task_relevance": extra.get("task_relevance"),
    }


def evaluation_to_schema(e: Evaluation, task_relevance: float | None = None) -> EvaluationSchema:
    extra = extras_from_evaluation(e)
    return EvaluationSchema(
        fluency_coherence=e.fluency_coherence,
        lexical_resource=e.lexical_resource,
        grammar=e.grammar,
        pronunciation=e.pronunciation or "Not assessed in this version",
        estimated_band=e.estimated_band,
        strengths=e.strengths,
        weaknesses=e.weaknesses,
        corrections=e.corrections,
        why_this_band=extra["why_this_band"] or list(e.weaknesses or [])[:4],
        better_versions=extra["better_versions"],
        detailed_feedback=e.detailed_feedback,
        part1_feedback=e.part1_feedback,
        part2_feedback=e.part2_feedback,
        part3_feedback=e.part3_feedback,
        improvement_tips=e.improvement_tips,
        task_relevance=task_relevance if task_relevance is not None else extra.get("task_relevance"),
        ai_status=extra["ai_status"],
    )
