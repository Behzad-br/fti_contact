"""Turn dropped HTML/text/JSON into reading/listening bank tests."""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

from app.book_meta import book_fields

logger = logging.getLogger(__name__)

SKIP_TAGS = {"script", "style", "noscript", "svg", "iframe"}
RAW_SUFFIXES = {".html", ".htm", ".txt", ".md", ".json"}

_PASSAGE_SPLIT = re.compile(
    r"(?:reading\s+passage|passage)\s+(\d+)\b",
    re.IGNORECASE,
)
_QUESTIONS_HEAD = re.compile(
    r"questions?\s+(\d+)\s*[-–—to]+\s*(\d+)",
    re.IGNORECASE,
)
_Q_LINE = re.compile(r"^\s*(\d{1,2})[.)]\s+(.+)$")
_OPT_LINE = re.compile(r"^\s*([A-H])[.)]\s+(.+)$")
_ANSWER_LINE = re.compile(
    r"^\s*(\d{1,2})[.)\s:]+(.+?)\s*$",
)
_TFNG = re.compile(r"\btrue\b|\bfalse\b|\bnot\s+given\b", re.I)
_YNNG = re.compile(r"\byes\b|\bno\b|\bnot\s+given\b", re.I)
_MCQ = re.compile(r"choose\s+the\s+correct\s+letter|\bmultiple\s+choice\b", re.I)
_HEADINGS = re.compile(r"matching\s+headings|choose\s+the\s+correct\s+heading", re.I)
_LISTENING = re.compile(r"\blistening\b|\bsection\s+[1-4]\b|\bpart\s+[1-4]\b", re.I)


class _HTMLText(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip = 0
        self.chunks: list[str] = []
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in SKIP_TAGS:
            self._skip += 1
            return
        if tag == "title":
            self._in_title = True
        if tag in {"p", "div", "h1", "h2", "h3", "h4", "li", "tr", "br", "section", "article"}:
            self.chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self._skip:
            self._skip -= 1
            return
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        self.chunks.append(text + " ")


def html_to_text(html: str) -> tuple[str, str]:
    parser = _HTMLText()
    parser.feed(html)
    raw = "".join(parser.chunks)
    raw = unicodedata.normalize("NFKC", raw)
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return parser.title.strip(), raw.strip()


def slug_id(stem: str, prefix: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    cleaned = cleaned or "page"
    return f"{prefix}-{cleaned}"[:80]


def _split_passages(body: str) -> list[tuple[str, str]]:
    matches = list(_PASSAGE_SPLIT.finditer(body))
    if not matches:
        text = body.strip()
        return [("Passage 1", text)] if text else []
    out: list[tuple[str, str]] = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        chunk = body[start:end].strip()
        q_at = _QUESTIONS_HEAD.search(chunk)
        if q_at:
            chunk = chunk[: q_at.start()].strip()
        num = match.group(1)
        title = f"Passage {num}"
        if chunk:
            out.append((title, chunk))
    return out


def _paragraphs(passage_id: str, text: str) -> list[dict]:
    blocks = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(blocks) < 2:
        blocks = [p.strip() for p in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text) if p.strip()]
        if len(blocks) > 12:
            merged: list[str] = []
            buf = []
            for sent in blocks:
                buf.append(sent)
                if len(buf) >= 4:
                    merged.append(" ".join(buf))
                    buf = []
            if buf:
                merged.append(" ".join(buf))
            blocks = merged
    labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    paras = []
    for i, block in enumerate(blocks[:26]):
        label = labels[i]
        clean = re.sub(r"^[A-Z]\.\s+", "", block).strip()
        paras.append({"label": label, "heading": "", "text": clean})
    if not paras:
        paras = [{"label": "A", "heading": "", "text": text.strip()}]
    return paras


def _infer_type(instruction: str, prompt: str, options: list[dict]) -> str:
    blob = f"{instruction} {prompt}"
    if options:
        return "multiple_choice"
    if _HEADINGS.search(blob):
        return "matching_headings"
    if _MCQ.search(blob):
        return "multiple_choice"
    if _TFNG.search(blob) and "yes" not in blob.lower():
        return "true_false_not_given"
    if re.search(r"\byes,\s*no\b|\bYES\s*/\s*NO\b", blob, re.I) or (
        _YNNG.search(blob) and "true" not in blob.lower()
    ):
        return "yes_no_not_given"
    if re.search(r"complete\s+the\s+summary", blob, re.I):
        return "summary_completion"
    if re.search(r"complete\s+the\s+notes", blob, re.I):
        return "note_completion"
    if re.search(r"complete\s+the\s+table", blob, re.I):
        return "table_completion"
    if re.search(r"no\s+more\s+than|complete\s+the\s+sentences", blob, re.I):
        return "sentence_completion"
    return "short_answer"


def _parse_questions(body: str, passage_ids: list[str]) -> list[dict]:
    lines = [ln.rstrip() for ln in body.splitlines()]
    questions: list[dict] = []
    instruction = ""
    current: dict | None = None
    passage_index = 0

    def flush() -> None:
        nonlocal current
        if current:
            questions.append(current)
            current = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if re.match(r"^answers?\b", stripped, re.I):
            flush()
            break
        head = _QUESTIONS_HEAD.match(stripped)
        if head:
            flush()
            instruction = stripped
            start_n = int(head.group(1))
            if start_n >= 27:
                passage_index = min(2, len(passage_ids) - 1)
            elif start_n >= 14:
                passage_index = min(1, len(passage_ids) - 1)
            else:
                passage_index = 0
            continue
        qmatch = _Q_LINE.match(stripped)
        if qmatch:
            flush()
            num = int(qmatch.group(1))
            prompt = qmatch.group(2).strip()
            pid = passage_ids[min(passage_index, len(passage_ids) - 1)] if passage_ids else ""
            current = {
                "number": num,
                "passage_id": pid,
                "instruction": instruction or "Answer the question.",
                "prompt": prompt,
                "options": [],
            }
            continue
        omatch = _OPT_LINE.match(stripped)
        if omatch and current is not None:
            current["options"].append({"code": omatch.group(1), "text": omatch.group(2).strip()})
            continue
        if current is not None and not _OPT_LINE.match(stripped) and not stripped.lower().startswith("questions"):
            current["prompt"] = f"{current['prompt']} {stripped}".strip()

    flush()

    out = []
    for q in questions:
        qtype = _infer_type(q["instruction"], q["prompt"], q["options"])
        item = {
            "id": "",
            "number": q["number"],
            "passage_id": q["passage_id"],
            "type": qtype,
            "instruction": q["instruction"],
            "prompt": q["prompt"],
            "answer": "",
            "accepted_answers": [],
        }
        if q["options"]:
            item["options"] = q["options"]
        out.append(item)
    if out:
        return out
    return _parse_questions_inline(body, passage_ids)


def _parse_questions_inline(body: str, passage_ids: list[str]) -> list[dict]:
    cut = re.split(r"\banswers?\b", body, maxsplit=1, flags=re.I)[0]
    found = list(re.finditer(r"(?:^|\n)\s*(\d{1,2})[.)]\s+", cut))
    out = []
    for i, match in enumerate(found):
        num = int(match.group(1))
        start = match.end()
        end = found[i + 1].start() if i + 1 < len(found) else len(cut)
        prompt = re.sub(r"\s+", " ", cut[start:end]).strip()
        options = []
        for om in re.finditer(r"\b([A-H])[.)]\s+([^A-H]+?)(?=\s+[A-H][.)]\s+|$)", prompt):
            options.append({"code": om.group(1), "text": om.group(2).strip(" .;")})
        if options:
            prompt = re.split(r"\bA[.)]\s+", prompt, maxsplit=1)[0].strip()
        pid = ""
        if passage_ids:
            if num >= 27:
                pid = passage_ids[min(2, len(passage_ids) - 1)]
            elif num >= 14:
                pid = passage_ids[min(1, len(passage_ids) - 1)]
            else:
                pid = passage_ids[0]
        item = {
            "id": "",
            "number": num,
            "passage_id": pid,
            "type": _infer_type("", prompt, options),
            "instruction": "Answer the question.",
            "prompt": prompt,
            "answer": "",
            "accepted_answers": [],
        }
        if options:
            item["options"] = options
        out.append(item)
    return out


def _parse_answers(body: str) -> dict[int, str]:
    answers: dict[int, str] = {}
    idx = re.search(r"\banswers?\b", body, re.I)
    blob = body[idx.start() :] if idx else body[-4000:]
    for line in blob.splitlines():
        m = _ANSWER_LINE.match(line.strip())
        if not m:
            continue
        num = int(m.group(1))
        if num < 1 or num > 40:
            continue
        val = m.group(2).strip().strip(".")
        if len(val) > 80:
            continue
        answers[num] = val
    return answers


def _is_listening(title: str, body: str) -> bool:
    head = f"{title}\n{body[:1500]}"
    if re.search(r"\breading\s+passage\b", head, re.I):
        return False
    return bool(_LISTENING.search(head))


def reading_test_from_text(stem: str, title: str, body: str) -> dict:
    test_id = slug_id(stem, "imported-reading")
    kind = "general_training" if re.search(r"general\s+training|\bGT\b", f"{title} {body[:800]}", re.I) else "academic"
    passages_raw = _split_passages(body)
    if not passages_raw:
        passages_raw = [(title or "Passage 1", body)]
    passages = []
    for i, (ptitle, ptext) in enumerate(passages_raw[:3], start=1):
        pid = f"{test_id}-p{i}"
        passages.append({
            "id": pid,
            "title": ptitle.strip() or f"Passage {i}",
            "genre": "academic_research" if kind == "academic" else "general_training",
            "paragraphs": _paragraphs(pid, ptext),
        })
    pids = [p["id"] for p in passages]
    questions = _parse_questions(body, pids)
    answers = _parse_answers(body)
    for q in questions:
        q["id"] = f"{test_id}-q{q['number']:02d}"
        ans = answers.get(q["number"], "")
        q["answer"] = ans
        q["accepted_answers"] = [ans] if ans else []
    test = {
        "id": test_id,
        "title": title or stem.replace("-", " ").title(),
        "test_type": kind,
        "duration_minutes": 60,
        "passage_count": len(passages),
        "question_count": len(questions),
        "source_status": "user_provided",
        "production_status": "imported_needs_review",
        "instructions": ["Answer all questions in the time allowed."],
        "passages": passages,
        "questions": questions,
        "import_warnings": _warnings(passages, questions),
    }
    test.update(book_fields({**test, "title": f"{title} {stem}"}, module="reading", track=kind))
    return test


def listening_test_from_text(stem: str, title: str, body: str) -> dict:
    test_id = slug_id(stem, "imported-listening")
    part = {
        "id": f"{test_id}-part-1",
        "part_number": 1,
        "title": title or "Listening",
        "context": "Imported recording / notes",
        "setting": "imported",
        "speakers": [],
        "audio_asset": "",
    }
    questions = _parse_questions(body, [])
    answers = _parse_answers(body)
    for q in questions:
        q["id"] = f"{test_id}-q{q['number']:02d}"
        q["part_number"] = 1
        q["part_id"] = part["id"]
        q.pop("passage_id", None)
        ans = answers.get(q["number"], "")
        q["answer"] = ans
        q["accepted_answers"] = [ans] if ans else []
        q["type"] = q.get("type") if q.get("type") != "true_false_not_given" else "note_completion"
    test = {
        "id": test_id,
        "title": title or stem.replace("-", " ").title(),
        "duration_minutes": 30,
        "part_count": 1,
        "question_count": len(questions),
        "source_status": "user_provided",
        "production_status": "imported_needs_review",
        "parts": [part],
        "questions": questions,
        "import_warnings": ["Listening audio not attached. Put an mp3 in data/listening_audio and set parts[0].audio_asset."]
        + _warnings([], questions),
    }
    test.update(book_fields({**test, "title": f"{title} {stem}"}, module="listening"))
    return test


def _warnings(passages: list, questions: list) -> list[str]:
    notes = []
    if passages and len(passages) < 3:
        notes.append(f"Only {len(passages)} passage(s) detected; full Academic Reading usually has 3.")
    if questions and len(questions) != 40:
        notes.append(f"{len(questions)} question(s) parsed; a full test is usually 40.")
    missing = [q["number"] for q in questions if not q.get("answer")]
    if missing:
        notes.append(f"No answer key found for question numbers: {missing[:12]}{'…' if len(missing) > 12 else ''}")
    if not questions:
        notes.append("No numbered questions found. Keep '1. …' question lines in the saved page.")
    return notes


def convert_payload(path: Path) -> tuple[str, dict] | None:
    suffix = path.suffix.lower()
    if suffix == ".json":
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.error("Cannot read %s: %s", path, exc)
            return None
        if not isinstance(payload, dict):
            return None
        if payload.get("passages") and payload.get("questions"):
            return "reading", payload
        if payload.get("parts") and payload.get("questions"):
            return "listening", payload
        return None
    raw = path.read_text(encoding="utf-8", errors="replace")
    title, body = html_to_text(raw) if suffix in {".html", ".htm"} else ("", raw)
    if not title:
        title = path.stem.replace("-", " ").replace("_", " ")
    if _is_listening(title, body):
        return "listening", listening_test_from_text(path.stem, title, body)
    return "reading", reading_test_from_text(path.stem, title, body)


def ingest_raw_folder(raw_dir: Path, reading_dir: Path, listening_dir: Path) -> list[Path]:
    written: list[Path] = []
    if not raw_dir.is_dir():
        return written
    reading_dir.mkdir(parents=True, exist_ok=True)
    listening_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(raw_dir.iterdir()):
        if path.name.startswith("_") or path.name.startswith("."):
            continue
        if path.suffix.lower() not in RAW_SUFFIXES or not path.is_file():
            continue
        converted = convert_payload(path)
        if not converted:
            logger.warning("Could not convert %s", path.name)
            continue
        kind, test = converted
        dest_dir = listening_dir if kind == "listening" else reading_dir
        dest = dest_dir / f"{test.get('id') or slug_id(path.stem, 'imported')}.json"
        dest.write_text(json.dumps(test, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(dest)
        logger.info("Ingested %s → %s", path.name, dest)
    return written
