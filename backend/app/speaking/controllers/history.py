"""History and progress controller."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.speaking.models import Evaluation, TestSession
from app.speaking.schemas import (
    AnswerReviewSchema,
    EvaluationSchema,
    HistoryItemSchema,
    HistoryListSchema,
    ProgressSchema,
    SessionResultSchema,
)
from app.speaking.services import speaking_session
from app.speaking.services.answer_review import review_session
from app.speaking.services.evaluation import local_evaluation
from app.speaking.services.relevance import session_relevance
from app.speaking.views.serializers import extras_from_evaluation

router = APIRouter()


@router.get("/history", response_model=HistoryListSchema)
async def list_history(db: Session = Depends(get_db)):
    sessions = db.query(TestSession).order_by(TestSession.started_at.desc()).all()
    items = [
        HistoryItemSchema(
            session_id=s.id,
            mode=s.mode,
            title=s.title,
            practice_part=s.practice_part,
            estimated_band=s.estimated_band,
            started_at=s.started_at,
            completed_at=s.completed_at,
            status=s.status,
        )
        for s in sessions
    ]
    return HistoryListSchema(sessions=items, total=len(items))


@router.get("/history/{session_id}", response_model=SessionResultSchema)
async def get_session_result(session_id: str, db: Session = Depends(get_db)):
    session = db.query(TestSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    eval_row = db.query(Evaluation).filter_by(session_id=session_id).first()
    qa_pairs = speaking_session.build_full_transcript(db, session_id)
    rel = session_relevance(qa_pairs)
    live = local_evaluation(qa_pairs) if qa_pairs else None
    reviews = review_session(qa_pairs, rel.get("per_answer")) if qa_pairs else {"items": []}

    eval_schema = None
    if eval_row:
        extra = extras_from_evaluation(eval_row)
        why = extra["why_this_band"] or list(eval_row.weaknesses or [])[:4]
        eval_schema = EvaluationSchema(
            fluency_coherence=eval_row.fluency_coherence,
            lexical_resource=eval_row.lexical_resource,
            grammar=eval_row.grammar,
            pronunciation=eval_row.pronunciation or "Not assessed in this version",
            estimated_band=eval_row.estimated_band,
            strengths=eval_row.strengths or [],
            weaknesses=eval_row.weaknesses or [],
            corrections=eval_row.corrections or [],
            why_this_band=why,
            better_versions=extra["better_versions"],
            detailed_feedback=eval_row.detailed_feedback,
            part1_feedback=eval_row.part1_feedback,
            part2_feedback=eval_row.part2_feedback,
            part3_feedback=eval_row.part3_feedback,
            improvement_tips=eval_row.improvement_tips,
            task_relevance=extra.get("task_relevance") if extra.get("task_relevance") is not None else rel["band"],
            ai_status=extra["ai_status"],
        )
    elif live:
        why = [str(item).strip() for item in (live.get("why_this_band") or live.get("weaknesses") or []) if str(item).strip()]
        eval_schema = EvaluationSchema(
            fluency_coherence=live.get("fluency_coherence"),
            lexical_resource=live.get("lexical_resource"),
            grammar=live.get("grammar"),
            pronunciation=live.get("pronunciation") or "Not assessed in this version",
            estimated_band=live.get("estimated_band"),
            strengths=live.get("strengths") or [],
            weaknesses=live.get("weaknesses") or [],
            corrections=live.get("corrections") or [],
            why_this_band=why[:4],
            better_versions=live.get("better_versions") or [],
            detailed_feedback=live.get("detailed_feedback"),
            part1_feedback=live.get("part1_feedback"),
            part2_feedback=live.get("part2_feedback"),
            part3_feedback=live.get("part3_feedback"),
            improvement_tips=live.get("improvement_tips"),
            task_relevance=live.get("task_relevance", rel["band"]),
            ai_status=live.get("ai_status") or "local",
        )

    answers = []
    for item, item_rel, item_rev in zip(qa_pairs, rel["per_answer"], reviews["items"]):
        answers.append(
            AnswerReviewSchema(
                part=item["part"],
                question_text=item["question_text"],
                transcript=item.get("transcript") or "",
                duration=item.get("duration"),
                word_count=item.get("word_count"),
                relevance_score=item_rel.get("score"),
                relevance_label=item_rel.get("label"),
                relevance_note=item_rel.get("note"),
                answer_band=item_rev.get("answer_band"),
                examiner_note=item_rev.get("examiner_note"),
                mark_cuts=item_rev.get("mark_cuts") or [],
                issues=item_rev.get("issues") or [],
            )
        )

    return SessionResultSchema(
        session_id=session.id,
        mode=session.mode,
        title=session.title,
        practice_part=session.practice_part,
        status=session.status,
        estimated_band=(eval_schema.estimated_band if eval_schema else session.estimated_band),
        started_at=session.started_at,
        completed_at=session.completed_at,
        evaluation=eval_schema,
        answers=answers,
    )


@router.get("/progress", response_model=ProgressSchema)
async def get_progress(db: Session = Depends(get_db)):
    sessions = (
        db.query(TestSession)
        .filter(TestSession.status == "completed")
        .order_by(TestSession.completed_at.desc())
        .limit(20)
        .all()
    )
    total = db.query(TestSession).filter(TestSession.status == "completed").count()
    recent_bands = [s.estimated_band for s in sessions[:10]]
    valid_bands = [b for b in recent_bands if b is not None]
    avg_band = round(sum(valid_bands) / len(valid_bands), 1) if valid_bands else None

    grammar_issues = []
    vocab_issues = []
    for sid in [s.id for s in sessions[:10]]:
        ev = db.query(Evaluation).filter_by(session_id=sid).first()
        if not ev:
            continue
        for w in ev.weaknesses:
            w_lower = w.lower()
            if any(kw in w_lower for kw in ["grammar", "sentence", "tense", "article", "verb"]):
                grammar_issues.append(w)
            elif any(kw in w_lower for kw in ["vocab", "word", "lexical", "collocation", "phrase"]):
                vocab_issues.append(w)

    return ProgressSchema(
        total_tests=total,
        recent_bands=recent_bands,
        average_band=avg_band,
        recurring_grammar_issues=list(dict.fromkeys(grammar_issues))[:3],
        recurring_vocab_issues=list(dict.fromkeys(vocab_issues))[:3],
    )
