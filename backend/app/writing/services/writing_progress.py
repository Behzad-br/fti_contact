"""Writing progress analytics and practice recommendations."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.writing.models import WritingAttempt, WritingQuestion
from app.writing.services.writing_core import ACADEMIC_TASK1_TYPES


CRITERION_KEYS = [
    "task_response_or_achievement",
    "coherence_and_cohesion",
    "lexical_resource",
    "grammatical_range_and_accuracy",
]

CRITERION_LABELS = {
    "task_response_or_achievement": "Task Achievement / Response",
    "coherence_and_cohesion": "Coherence & Cohesion",
    "lexical_resource": "Lexical Resource",
    "grammatical_range_and_accuracy": "Grammatical Range & Accuracy",
}


def _avg(values: list[float]) -> Optional[float]:
    valid = [v for v in values if v is not None]
    if not valid:
        return None
    return round(sum(valid) / len(valid), 2)


def collect_progress(db: Session, student_id: str, days: Optional[int] = None) -> dict:
    query = db.query(WritingAttempt).filter(
        WritingAttempt.student_id == student_id,
        WritingAttempt.status.in_(("graded", "published", "teacher_review")),
        WritingAttempt.submitted_at.isnot(None),
    )
    if days:
        since = datetime.utcnow() - timedelta(days=days)
        query = query.filter(WritingAttempt.submitted_at >= since)
    attempts = query.order_by(WritingAttempt.submitted_at.asc()).all()

    est, teacher, t1, t2 = [], [], [], []
    words, times = [], []
    criterion_scores = {k: [] for k in CRITERION_KEYS}
    timeline = []
    type_scores = defaultdict(list)

    for a in attempts:
        q = a.question
        band = a.final_band if a.final_band is not None else a.teacher_band or a.estimated_band
        if a.estimated_band is not None:
            est.append(a.estimated_band)
        if a.teacher_band is not None:
            teacher.append(a.teacher_band)
        if q and q.task_number == 1 and band is not None:
            t1.append(band)
        if q and q.task_number == 2 and band is not None:
            t2.append(band)
        if a.word_count:
            words.append(a.word_count)
        if a.time_spent_seconds:
            times.append(a.time_spent_seconds)
        grading = a.grading or {}
        criteria = grading.get("criteria") or {}
        for key in CRITERION_KEYS:
            b = (criteria.get(key) or {}).get("band")
            if b is not None:
                criterion_scores[key].append(float(b))
        if q:
            type_scores[f"{q.test_type}:{q.task_number}:{q.question_type}"].append(band)
        timeline.append(
            {
                "date": a.submitted_at.isoformat() if a.submitted_at else None,
                "estimated_band": a.estimated_band,
                "teacher_band": a.teacher_band,
                "final_band": band,
                "task_number": q.task_number if q else None,
                "criteria": {
                    k: (criteria.get(k) or {}).get("band") for k in CRITERION_KEYS
                },
            }
        )

    averages = {k: _avg(v) for k, v in criterion_scores.items()}
    present = {k: v for k, v in averages.items() if v is not None}
    strongest = max(present, key=present.get) if present else None
    weakest = min(present, key=present.get) if present else None

    weak_types = []
    for key, scores in type_scores.items():
        valid = [s for s in scores if s is not None]
        if valid and sum(valid) / len(valid) <= 5.5:
            weak_types.append({"key": key, "average": round(sum(valid) / len(valid), 2)})

    recommendation = None
    if weakest:
        recommendation = f"Recommended focus: {CRITERION_LABELS[weakest]}"
        if weak_types:
            recommendation += f". Weak category: {weak_types[0]['key'].replace(':', ' / ')}"

    return {
        "attempts_completed": len(attempts),
        "average_estimated_band": _avg(est),
        "average_teacher_band": _avg(teacher),
        "task1_average": _avg(t1),
        "task2_average": _avg(t2),
        "criterion_averages": {CRITERION_LABELS[k]: v for k, v in averages.items()},
        "criterion_keys": averages,
        "total_writing_time_seconds": sum(times),
        "average_word_count": _avg([float(w) for w in words]),
        "strongest_criterion": CRITERION_LABELS.get(strongest) if strongest else None,
        "weakest_criterion": CRITERION_LABELS.get(weakest) if weakest else None,
        "recommendation": recommendation,
        "weak_types": weak_types,
        "timeline": timeline,
        "days": days,
    }


def recommended_filters(progress: dict) -> dict:
    weak = progress.get("weak_types") or []
    if weak:
        parts = weak[0]["key"].split(":")
        if len(parts) == 3:
            return {
                "test_type": parts[0],
                "task_number": int(parts[1]),
                "question_type": parts[2],
            }
    return {"test_type": "academic", "task_number": 2}
