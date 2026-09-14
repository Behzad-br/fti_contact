"""
services/evaluation.py — Full-test IELTS evaluation via MiniMax.

Prompt design adapted from references/prompts.md in the original repo.

Key rules (as specified):
  - Pronunciation is NEVER assessed from transcript text
  - Estimated band is clearly labelled as a PRACTICE estimate
  - All AI requests happen server-side (API key never touches browser)
"""
import json
import logging

from app.llm.client import minimax_client, MinimaxError
from app.speaking.services.fluency_metrics import build_fluency_context
from app.speaking.services.speech_quality import analyze_session, score_from_speech
from app.speaking.services.relevance import session_relevance
from app.speaking.services.answer_review import cap_result_to_answers, review_session

logger = logging.getLogger(__name__)

_EVALUATION_SYSTEM_PROMPT = """You are an expert IELTS Speaking examiner evaluating a complete mock speaking test.

You will receive:
1. The full Q&A transcript for all three parts
2. Basic fluency metrics (word count, WPM, fillers) — use these as supplementary signals only

Your task is to evaluate using IELTS criteria:
- Fluency and Coherence (FC): flow, hesitation, cohesive devices, topic development
- Lexical Resource (LR): vocabulary range, appropriacy, word choice, collocations
- Grammatical Range and Accuracy (GRA): sentence structure, tense, accuracy, complexity
- Pronunciation: You CANNOT assess pronunciation from text. Always return "Not assessed in this version"
- Question relevance: EACH answer must address THAT question. Off-topic talk must lower the score.

IMPORTANT ACCURACY RULES:
1. Do NOT fabricate a pronunciation band. Return the string "Not assessed in this version" for pronunciation.
2. The estimated band is a PRACTICE estimate, NOT an official IELTS result.
3. Be honest and constructive — do not inflate scores.
4. Base your feedback ONLY on what the student actually said, not a model answer.
5. If answers are silent, empty, one word, or clearly not a real response, give Band 1.0–2.0. NEVER invent a Band 5 for missing speech.
6. If the student speaks English but it is NOT relevant to the question asked, mark task_relevance low (1–4) and reduce fluency_coherence. Do not reward off-topic fluency.

You MUST respond with valid JSON only. No markdown, no explanation. JSON schema:

{
  "fluency_coherence": 6.5,
  "lexical_resource": 6.0,
  "grammar": 6.5,
  "task_relevance": 6.0,
  "pronunciation": "Not assessed in this version",
  "estimated_band": 6.0,
  "strengths": [
    "Clear topic development in Part 2",
    "Good use of cohesive devices like 'however' and 'moreover'"
  ],
  "weaknesses": [
    "Frequent use of filler 'like' reduces fluency",
    "Limited range of complex sentence structures"
  ],
  "corrections": [
    {"original": "I have went to the market yesterday", "better": "I went to the market yesterday", "explanation": "Use past simple with yesterday, not present perfect."},
    {"original": "She don't like spicy food", "better": "She doesn't like spicy food", "explanation": "Third-person singular needs doesn't."}
  ],
  "why_this_band": [
    "Part 2 stayed on the cue card but several Part 1 answers were under 20 seconds.",
    "Grammar errors like 'I have went' keep Grammatical Range below 6."
  ],
  "better_versions": [
    {
      "question": "Do you work or are you a student?",
      "you_said": "I student. I like it.",
      "say_it_like_this": "I'm a student at the moment. I enjoy it because the course is practical and I can use English every day."
    }
  ],
  "part1_feedback": "Part 1 answers were generally relevant but brief. Try to extend your answers with reasons and examples.",
  "part2_feedback": "Good use of personal experience. The narrative was mostly coherent. Work on signposting transitions.",
  "part3_feedback": "Part 3 showed some abstract thinking. Aim for more developed arguments with examples.",
  "improvement_tips": "Focus on reducing filler words and using a wider range of complex sentences. Aim for Band 7.",
  "detailed_feedback": "Overall the candidate demonstrated B2-level English..."
}

why_this_band is required: 2–4 bullets that quote THIS transcript (length, fillers, off-topic, grammar). Never invent speech.
corrections must quote the student's actual words, then a better line, then a short explanation.
better_versions: 2–5 of the weakest answers. Give one stronger spoken version in natural spoken English — not a written essay.
If answers are empty, random sounds, or not English, keep scores at 0–2 and say there is nothing to assess.
"""


def _build_transcript_prompt(qa_pairs: list) -> str:
    """Format the Q&A pairs and fluency metrics into the user prompt."""
    sections = {1: [], 2: [], 3: []}
    for item in qa_pairs:
        part = item.get("part", 1)
        sections.setdefault(part, []).append(item)

    lines = ["# Complete IELTS Speaking Test Transcript\n"]

    for part_num in [1, 2, 3]:
        lines.append(f"## Part {part_num}\n")
        for item in sections.get(part_num, []):
            lines.append(f"**Question:** {item['question_text']}")
            transcript = item.get("transcript", "").strip()
            lines.append(f"**Answer:** {transcript or '[No answer recorded]'}")
            lines.append("Judge whether this answer is RELEVANT to the question above.\n")

    # Add fluency metrics
    lines.append("\n---\n")
    lines.append(build_fluency_context(qa_pairs))

    return "\n".join(lines)


def local_evaluation(qa_pairs: list) -> dict:
    """Strict transcript-based score used for display and as a cap on any AI score."""
    result = _apply_relevance(_normalize_evaluation(score_from_speech(qa_pairs)), qa_pairs)
    rel = session_relevance(qa_pairs)
    reviews = review_session(qa_pairs, rel.get("per_answer"))
    return cap_result_to_answers(result, reviews)


async def evaluate_session(qa_pairs: list) -> dict:
    """
    Evaluate a complete IELTS Speaking session.

    Args:
        qa_pairs: List of dicts from speaking_session.build_full_transcript()

    Returns:
        dict with evaluation results (fluency_coherence, lexical_resource, etc.)
    """
    user_prompt = _build_transcript_prompt(qa_pairs)
    speech_stats = analyze_session(qa_pairs)
    strict = local_evaluation(qa_pairs)

    # Never send an empty test to the LLM just to get a flattering score.
    if speech_stats["insufficient_session"]:
        strict["raw_ai_response"] = json.dumps({"reason": "insufficient_speech", "ai_status": "insufficient"})
        strict["ai_status"] = "insufficient"
        return strict

    try:
        result = await minimax_client.chat_json(_EVALUATION_SYSTEM_PROMPT, user_prompt)
        normalized = _normalize_evaluation(result)
        applied = _apply_relevance(normalized, qa_pairs)
        rel = session_relevance(qa_pairs)
        applied = cap_result_to_answers(applied, review_session(qa_pairs, rel.get("per_answer")))
        # Cap inflated scores, but keep AI comments so students still see mistakes and better lines.
        for key in ("fluency_coherence", "lexical_resource", "grammar", "estimated_band", "task_relevance"):
            if applied.get(key) is not None and strict.get(key) is not None:
                applied[key] = min(float(applied[key]), float(strict[key]))
        applied["ai_status"] = "ai"
        return applied
    except MinimaxError as exc:
        logger.error("MiniMax evaluation failed, using speech-based fallback: %s", exc)
        strict["raw_ai_response"] = json.dumps({"fallback": True, "reason": str(exc), "ai_status": "fallback"})
        strict["ai_status"] = "fallback"
        return strict


def _on_topic_content_words(qa_pairs: list, rel: dict) -> int:
    from app.speaking.services.speech_quality import content_words

    total = 0
    for item, item_rel in zip(qa_pairs, rel.get("per_answer") or []):
        n = len(content_words(item.get("transcript") or ""))
        label = item_rel.get("label")
        if label == "on_topic":
            total += n
        elif label == "partly":
            total += n // 2
    return total


def _apply_relevance(result: dict, qa_pairs: list) -> dict:
    """Force scores to reflect official-style task achievement, not any spoken English."""
    rel = session_relevance(qa_pairs)
    result["task_relevance"] = rel["band"]
    on_words = _on_topic_content_words(qa_pairs, rel)
    on_count = sum(1 for r in rel["per_answer"] if r.get("label") == "on_topic")
    partly_count = sum(1 for r in rel["per_answer"] if r.get("label") == "partly")

    weaknesses = [
        w for w in (result.get("weaknesses") or [])
        if "produced connected english" not in w.lower()
    ]
    if rel["off_topic_count"]:
        msg = (
            f"{rel['off_topic_count']} answer(s) did not address the question that was asked. "
            "IELTS Speaking marks task achievement: off-topic talk cannot raise Fluency or Vocabulary."
        )
        if msg not in weaknesses:
            weaknesses.insert(0, msg)
    if partly_count:
        weaknesses.append(
            f"{partly_count} answer(s) only partly matched the question (repetition, echo, or missing detail)."
        )
    result["weaknesses"] = weaknesses

    strengths = [
        s for s in (result.get("strengths") or [])
        if "produced connected english" not in s.lower()
        and "stayed on the question" not in s.lower()
    ]
    if on_count >= 8 and rel["off_topic_count"] == 0:
        strengths.insert(
            0,
            f"{on_count} answers stayed on the question topic — that is only task relevance, not a high language band.",
        )
    result["strengths"] = strengths[:6] or [
        "Some English was recorded, but many answers missed the question or were too short for IELTS."
    ]

    if on_words < 50:
        content_cap = 4.0
    elif on_words < 100:
        content_cap = 4.5
    elif on_words < 160:
        content_cap = 5.0
    else:
        content_cap = 9.0

    relevance_cap = 9.0
    if rel["off_topic_count"] >= 4 or rel["average"] < 0.4:
        relevance_cap = 4.0
    elif rel["off_topic_count"] >= 3 or rel["average"] < 0.5:
        relevance_cap = 4.5
    elif rel["average"] < 0.6:
        relevance_cap = 5.0

    cap = min(content_cap, relevance_cap)

    def half(v: float) -> float:
        return round(max(1.0, min(9.0, v)) * 2) / 2

    for key in ("fluency_coherence", "lexical_resource", "grammar", "estimated_band"):
        if result.get(key) is not None:
            result[key] = half(min(float(result[key]), cap))
    result["task_relevance"] = half(float(rel["band"]))

    tips = result.get("improvement_tips") or ""
    if rel["off_topic_count"] and "relevant" not in tips.lower():
        result["improvement_tips"] = (
            "Answer the exact question on screen. Start with a direct response, then add a reason and an example. "
            + tips
        ).strip()
    return result


def _normalize_evaluation(raw: dict) -> dict:
    """Ensure the evaluation dict has all required fields with sane values."""

    def clamp(v, lo=0.0, hi=9.0):
        try:
            return max(lo, min(hi, float(v)))
        except (TypeError, ValueError):
            return None

    fc = clamp(raw.get("fluency_coherence"))
    lr = clamp(raw.get("lexical_resource"))
    gr = clamp(raw.get("grammar"))
    tr = clamp(raw.get("task_relevance"))

    # Calculate estimated band from the three assessed dimensions
    numeric_scores = [s for s in [fc, lr, gr, tr] if s is not None]
    if numeric_scores:
        avg = sum(numeric_scores) / len(numeric_scores)
        # Round to nearest 0.5
        estimated_band = round(avg * 2) / 2
    else:
        estimated_band = None

    # Override estimated_band if MiniMax provided one within a reasonable range
    if raw.get("estimated_band") is not None:
        ai_band = clamp(raw["estimated_band"])
        if ai_band is not None and abs(ai_band - (estimated_band or 0)) <= 1.5:
            estimated_band = ai_band

    pron = raw.get("pronunciation") or "Not assessed in this version"
    if not isinstance(pron, str) or "not assessed" not in pron.lower():
        pron = "Not assessed in this version"

    why = raw.get("why_this_band") or []
    if isinstance(why, str) and why.strip():
        why = [why.strip()]
    if not isinstance(why, list):
        why = []
    why = [str(item).strip() for item in why if str(item).strip()]

    corrections = []
    for item in raw.get("corrections") or []:
        if not isinstance(item, dict):
            continue
        original = str(item.get("original") or "").strip()
        better = str(item.get("better") or item.get("suggested") or "").strip()
        if not original and not better:
            continue
        row = {"original": original, "better": better}
        explanation = str(item.get("explanation") or "").strip()
        if explanation:
            row["explanation"] = explanation
        corrections.append(row)

    better_versions = []
    for item in raw.get("better_versions") or raw.get("better_answer_snippets") or []:
        if not isinstance(item, dict):
            continue
        spoken = str(item.get("say_it_like_this") or item.get("better") or "").strip()
        if not spoken:
            continue
        better_versions.append(
            {
                "question": str(item.get("question") or "").strip(),
                "you_said": str(item.get("you_said") or item.get("original") or "").strip(),
                "say_it_like_this": spoken,
            }
        )

    return {
        "fluency_coherence": fc,
        "lexical_resource": lr,
        "grammar": gr,
        "task_relevance": tr,
        "pronunciation": pron,
        "estimated_band": estimated_band,
        "strengths": raw.get("strengths", []) or [],
        "weaknesses": raw.get("weaknesses", []) or [],
        "corrections": corrections,
        "why_this_band": why,
        "better_versions": better_versions,
        "part1_feedback": raw.get("part1_feedback", ""),
        "part2_feedback": raw.get("part2_feedback", ""),
        "part3_feedback": raw.get("part3_feedback", ""),
        "improvement_tips": raw.get("improvement_tips", ""),
        "detailed_feedback": raw.get("detailed_feedback", ""),
        "raw_ai_response": json.dumps(raw),
    }
