"""Generate original IELTS-style reading passages via the configured LLM.

Answers stay on the server. Grading uses the same key-matching engine as the pack.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from app.llm.client import MinimaxError, minimax_client

logger = logging.getLogger(__name__)

ALLOWED_TYPES = {
    "multiple_choice",
    "true_false_not_given",
    "yes_no_not_given",
    "matching_headings",
    "matching_information",
    "matching_features",
    "matching_sentence_endings",
    "sentence_completion",
    "summary_completion",
    "note_completion",
    "short_answer",
}

_SYSTEM = """You create ORIGINAL IELTS Reading practice material for students.
This is independent practice, not an official IELTS test.

Rules:
- Invent organisations, places, studies and people. Do not copy Cambridge, British Council, IDP or website past papers.
- Write a realistic passage of 6 paragraphs labelled A–F.
- Every question answer MUST be findable in the passage.
- Completion/short-answer answers must be 1–4 words copied or closely taken from the passage.
- True/False/Not Given and Yes/No/Not Given must use those exact labels.
- Multiple-choice and matching questions need options with codes A, B, C, D (or more if needed).
- Do not request diagrams. Do not use diagram_label_completion, table_completion or flow_chart_completion.
- Return JSON only.

JSON shape:
{
  "title": "short test title",
  "passage": {
    "title": "passage title",
    "paragraphs": [
      {"label": "A", "heading": "short heading", "text": "80-110 words..."}
    ]
  },
  "questions": [
    {
      "type": "multiple_choice",
      "instruction": "Choose the correct letter, A, B, C or D.",
      "prompt": "question text",
      "options": [{"code": "A", "text": "..."}, {"code": "B", "text": "..."}, {"code": "C", "text": "..."}, {"code": "D", "text": "..."}],
      "answer": "B",
      "answer_text": "option B text",
      "accepted_answers": ["B"],
      "evidence": "exact sentence from the passage",
      "explanation": "one sentence why this is correct"
    }
  ]
}
"""


def _user_prompt(
    *,
    test_type: str,
    passage_index: int,
    count: int,
    start_number: int,
    question_type: Optional[str],
    avoid_titles: list[str],
) -> str:
    style = (
        "Academic Reading: a research/report style article on science, environment, history or society."
        if test_type == "academic"
        else "General Training Reading: everyday workplace, community or magazine-style text."
    )
    avoid = ", ".join(avoid_titles[-6:]) if avoid_titles else "none"
    type_line = (
        f"ALL {count} questions must be type `{question_type}`."
        if question_type
        else (
            f"Mix these types across the {count} questions: multiple_choice, true_false_not_given, "
            "yes_no_not_given, matching_headings, matching_information, sentence_completion, short_answer."
        )
    )
    return (
        f"{style}\n"
        f"Create passage {passage_index} with exactly {count} questions numbered conceptually from "
        f"{start_number} to {start_number + count - 1}.\n"
        f"{type_line}\n"
        f"Do NOT reuse these recent titles: {avoid}.\n"
        "Return JSON only."
    )


def _letters() -> list[str]:
    return list("ABCDEF")


def _normalize_passage(raw: dict, passage_id: str) -> dict:
    src = raw.get("passage") or raw
    paragraphs = []
    for idx, para in enumerate(src.get("paragraphs") or []):
        label = str(para.get("label") or _letters()[idx] if idx < 6 else idx + 1).strip()[:8]
        text = " ".join(str(para.get("text") or "").split())
        if not text:
            continue
        paragraphs.append(
            {
                "label": label,
                "heading": (para.get("heading") or "").strip() or None,
                "text": text,
            }
        )
    if len(paragraphs) < 4:
        raise ValueError("Generated passage is too short.")
    title = (src.get("title") or raw.get("title") or "Reading passage").strip()
    body = "\n\n".join(
        f"{p['label']}. {p['text']}" for p in paragraphs
    )
    return {
        "id": passage_id,
        "title": title,
        "genre": "ai_practice",
        "paragraphs": paragraphs,
        "text": body,
    }


def _clean_accepted(question: dict) -> list[str]:
    accepted = question.get("accepted_answers") or []
    if not accepted and question.get("answer"):
        accepted = [question.get("answer")]
        extra = question.get("answer_text")
        if extra and extra not in accepted:
            accepted.append(extra)
    cleaned = []
    for item in accepted:
        text = str(item or "").strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def _normalize_question(raw: dict, *, qid: str, number: int, passage_id: str) -> dict:
    qtype = str(raw.get("type") or "").strip()
    if qtype not in ALLOWED_TYPES:
        qtype = "short_answer"
    prompt = str(raw.get("prompt") or "").strip()
    if not prompt:
        raise ValueError(f"Question {number} has no prompt.")
    accepted = _clean_accepted(raw)
    if not accepted:
        raise ValueError(f"Question {number} has no answer key.")
    options = []
    for opt in raw.get("options") or []:
        code = str(opt.get("code") or "").strip()
        text = str(opt.get("text") or "").strip()
        if code and text:
            options.append({"code": code, "text": text})
    needs_options = qtype in {
        "multiple_choice",
        "matching_headings",
        "matching_information",
        "matching_features",
        "matching_sentence_endings",
    }
    if needs_options and len(options) < 3:
        raise ValueError(f"Question {number} needs options.")
    instruction = str(raw.get("instruction") or "").strip()
    if not instruction:
        instruction = {
            "multiple_choice": "Choose the correct letter, A, B, C or D.",
            "true_false_not_given": "Write True, False or Not Given.",
            "yes_no_not_given": "Write Yes, No or Not Given.",
            "short_answer": "Answer using NO MORE THAN FOUR WORDS AND/OR A NUMBER.",
            "sentence_completion": "Complete the sentence. Use NO MORE THAN FOUR WORDS AND/OR A NUMBER.",
            "summary_completion": "Complete the summary. Use NO MORE THAN FOUR WORDS AND/OR A NUMBER.",
            "note_completion": "Complete the note. Use NO MORE THAN FOUR WORDS AND/OR A NUMBER.",
        }.get(qtype, "Answer the question.")
    answer = str(raw.get("answer") or accepted[0]).strip()
    return {
        "id": qid,
        "number": number,
        "passage_id": passage_id,
        "type": qtype,
        "instruction": instruction,
        "prompt": prompt,
        "options": options or None,
        "answer": answer,
        "answer_text": str(raw.get("answer_text") or answer).strip(),
        "accepted_answers": accepted,
        "evidence": (raw.get("evidence") or "").strip() or None,
        "source_locator": {"paragraph": (raw.get("source_locator") or {}).get("paragraph")} if raw.get("source_locator") else None,
        "explanation": (raw.get("explanation") or "").strip() or None,
    }


def normalize_generated(
    raw: dict,
    *,
    test_type: str,
    passage_index: int,
    start_number: int,
    count: int,
    token: str,
) -> dict:
    passage_id = f"ai-{token}-p{passage_index}"
    passage = _normalize_passage(raw, passage_id)
    questions = []
    for idx, item in enumerate(raw.get("questions") or []):
        if len(questions) >= count:
            break
        number = start_number + len(questions)
        qid = f"{passage_id}-q{number:02d}"
        questions.append(_normalize_question(item, qid=qid, number=number, passage_id=passage_id))
    if len(questions) < max(6, count - 2):
        raise ValueError(f"Generator returned too few questions ({len(questions)}).")
    return {
        "title": (raw.get("title") or passage["title"]).strip(),
        "passage": passage,
        "questions": questions,
    }


async def _generate_one(
    *,
    test_type: str,
    passage_index: int,
    count: int,
    start_number: int,
    question_type: Optional[str],
    avoid_titles: list[str],
    token: str,
) -> dict:
    user = _user_prompt(
        test_type=test_type,
        passage_index=passage_index,
        count=count,
        start_number=start_number,
        question_type=question_type,
        avoid_titles=avoid_titles,
    )
    last_error: Optional[Exception] = None
    for _ in range(2):
        try:
            raw = await minimax_client.chat_json(_SYSTEM, user, retries=1, max_tokens=8000)
            return normalize_generated(
                raw,
                test_type=test_type,
                passage_index=passage_index,
                start_number=start_number,
                count=count,
                token=token,
            )
        except (MinimaxError, ValueError, TypeError) as exc:
            last_error = exc
            logger.warning("Reading AI generation attempt failed: %s", exc)
    raise MinimaxError(str(last_error) or "Could not generate a reading passage.")


async def generate_ai_test(
    *,
    test_type: str = "academic",
    full_mock: bool = False,
    question_type: Optional[str] = None,
    avoid_titles: Optional[list[str]] = None,
) -> dict:
    if test_type not in ("academic", "general_training"):
        test_type = "academic"
    if question_type and question_type not in ALLOWED_TYPES:
        raise ValueError("That question type cannot be generated.")
    token = uuid.uuid4().hex[:8]
    avoid = list(avoid_titles or [])
    if full_mock and not question_type:
        parts = []
        start = 1
        for idx, count in enumerate((13, 13, 14), start=1):
            part = await _generate_one(
                test_type=test_type,
                passage_index=idx,
                count=count,
                start_number=start,
                question_type=None,
                avoid_titles=avoid,
                token=token,
            )
            avoid.append(part["passage"]["title"])
            parts.append(part)
            start += count
        questions = [q for part in parts for q in part["questions"]]
        passages = [part["passage"] for part in parts]
        kind = "Academic" if test_type == "academic" else "General Training"
        return {
            "id": f"ai-full-{token}",
            "title": f"Fresh AI {kind} Reading Mock",
            "test_type": test_type,
            "duration_minutes": 60,
            "passage_count": 3,
            "question_count": len(questions),
            "generated_by_ai": True,
            "instructions": [
                "AI-generated practice test. Answers stay hidden until you submit.",
                "Estimated practice band only — not an official IELTS result.",
            ],
            "passages": passages,
            "questions": questions,
        }

    count = 8 if question_type else 13
    part = await _generate_one(
        test_type=test_type,
        passage_index=1,
        count=count,
        start_number=1,
        question_type=question_type,
        avoid_titles=avoid,
        token=token,
    )
    kind = "Academic" if test_type == "academic" else "General Training"
    suffix = question_type.replace("_", " ") if question_type else "passage"
    return {
        "id": f"ai-passage-{token}",
        "title": f"Fresh AI {kind} — {part['passage']['title']}",
        "test_type": test_type,
        "duration_minutes": 20,
        "passage_count": 1,
        "question_count": len(part["questions"]),
        "generated_by_ai": True,
        "instructions": [
            f"AI-generated {suffix} practice. Answers stay hidden until you submit.",
            "This is a practice score, not a full-test band, unless you sit a 40-question mock.",
        ],
        "passages": [part["passage"]],
        "questions": part["questions"],
    }
