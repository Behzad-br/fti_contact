"""Layout a user-provided Engnovate reading archive into data/reading-packs."""
from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from bs4 import BeautifulSoup, NavigableString, Tag

from app.config import settings


BOOK_DIR = re.compile(r"(?i)^book_\d+$")
TEST_DIR = re.compile(r"(?i)^test_\d+$")
QUESTION_RANGE = re.compile(r"Questions?\s+(\d+)\s*[-–to]+\s*(\d+)", re.I)
MULTI_SELECT = {"two_choices", "three_choices", "four_choices", "five_choices"}
CHOICE_TYPES = {
    "multiple_choice",
    "matching_headings",
    "matching_information",
    "matching_features",
    "matching_sentence_endings",
}

QUESTION_TYPE_MAP = {
    "one_choice": "multiple_choice",
    "two_choices": "multiple_choice",
    "three_choices": "multiple_choice",
    "four_choices": "multiple_choice",
    "five_choices": "multiple_choice",
    "true_false_notgiven": "true_false_not_given",
    "yes_no_notgiven": "yes_no_not_given",
    "diagram_labeling": "diagram_label_completion",
    "short_answers": "short_answer",
}


def _clean(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\ufffd", "").replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "book"


def pack_folder(zip_name: str) -> str:
    stem = PurePosixPath(zip_name).stem
    stem = re.sub(r"^Reading_", "", stem, flags=re.I)
    return stem


def infer_track(name: str, folder: str = "") -> str:
    stem = f"{PurePosixPath(name).stem} {folder}".lower()
    if "academic" in stem and "general" not in stem:
        return "academic"
    if "general" in stem:
        return "general_training"
    return "academic"


def book_title(folder: str, metadata_title: str = "", track: str = "academic") -> str:
    if metadata_title:
        cleaned = re.sub(r"\s+Reading Test\s+\d+\s*$", "", metadata_title, flags=re.I).strip()
        if cleaned:
            return cleaned
    number_match = re.search(r"Book[_-]?(\d+)", folder, re.I)
    number = int(number_match.group(1)) if number_match else None
    low = folder.lower()
    track_label = "Academic" if "academic" in (track + " " + low) else "General Training"
    if "cambridge" in low:
        return f"Cambridge IELTS {number} {track_label}" if number else f"Cambridge IELTS {track_label}"
    if "trainer" in low:
        return f"IELTS Trainer Book {number} {track_label}" if number else f"IELTS Trainer {track_label}"
    if "practice-test-plus" in low or "practice_test_plus" in low:
        return f"Practice Tests Plus Book {number} {track_label}" if number else f"Practice Tests Plus {track_label}"
    if "collins" in low:
        return f"Collins Practice Tests Book {number} {track_label}" if number else f"Collins {track_label}"
    if "recent-actual" in low or "recent_actual" in low:
        return f"Recent Actual Tests Book {number} {track_label}" if number else f"Recent Actual Tests {track_label}"
    if "barron" in low:
        return f"Barron's Practice Exams {track_label}"
    if "oxford" in low:
        return f"Oxford IELTS Practice Tests {track_label}"
    if "official-guide" in low or "official_guide" in low:
        return f"Official Guide to IELTS {track_label}"
    if "official-ielts-practice" in low:
        return f"Official IELTS Practice Materials {track_label}"
    if "simulation" in low:
        return f"IELTS Simulation Tests {track_label}"
    if "past-paper" in low or "past_paper" in low:
        return f"IELTS Past Papers {track_label}"
    if "road-to-ielts" in low or "road_to_ielts" in low:
        return f"Road to IELTS {track_label}"
    return _clean(folder.replace("-", " ").replace("_", " "))


def flatten_member(member: str) -> str:
    parts = list(PurePosixPath(member).parts)
    if parts and parts[0].startswith("__"):
        return member
    if parts and BOOK_DIR.match(parts[0]):
        parts = parts[1:]
    elif len(parts) > 1 and TEST_DIR.match(str(parts[1])):
        parts = parts[1:]
    return str(PurePosixPath(*parts)) if parts else member


def _answer_variants(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [_clean(item) for item in raw if _clean(item)]
    text = _clean(raw)
    if not text:
        return []
    values = [_clean(item) for item in re.split(r"\s*/\s*", text)]
    return list(dict.fromkeys(item for item in values if item))


def _split_explanation(raw: str) -> tuple[str | None, str]:
    text = str(raw or "").replace("\r\n", "\n")
    excerpt = ""
    match = re.search(
        r"Excerpt(?:/Passage)? Explanation:\s*(.*?)(?:\n\s*Answer Explanation:|\n\s*Reason For Correctness:|\Z)",
        text,
        re.S | re.I,
    )
    if match:
        excerpt = _clean(match.group(1))
    return excerpt or None, _clean(text)


def _heading_text(section: Tag | None) -> str:
    if not section:
        return ""
    heading = section.select_one(".ielts-reading-question-section-heading")
    text = heading.get_text(" ", strip=True) if heading else ""
    text = re.sub(r"Practice this section only.*", "", text, flags=re.I)
    return _clean(text)


def _section_index(soup: BeautifulSoup) -> list[tuple[int, int, Tag]]:
    rows: list[tuple[int, int, Tag]] = []
    for section in soup.select(".ielts-reading-question-section"):
        match = QUESTION_RANGE.search(_heading_text(section))
        if match:
            rows.append((int(match.group(1)), int(match.group(2)), section))
    return rows


def _section_for(number: int, sections: list[tuple[int, int, Tag]]) -> Tag | None:
    hits = [(hi - lo, section) for lo, hi, section in sections if lo <= number <= hi]
    if not hits:
        return None
    hits.sort(key=lambda row: row[0])
    return hits[0][1]


def _clone_text(node: Tag, *, target: int) -> str:
    clone = BeautifulSoup(str(node), "html.parser")
    for remove in clone.select(
        ".ielts-reading-option,.ielts-reading-matching-option-cell,.dnd-cards-container,"
        ".dnd-panel-instruction,.dnd-drop-placeholder,.dnd-drop-value,.heading-dnd-panel,"
        ".ielts-reading-practice-section-button"
    ):
        remove.decompose()
    for number in clone.select(".ielts-reading-question-number"):
        value = _clean(number.get_text())
        number.replace_with("" if value == str(target) else f"[{value}]")
    for control in clone.find_all(["input", "select", "textarea"]):
        control.replace_with("____")
    text = _clean(clone.get_text(" ", strip=True)).lstrip("• ").strip()
    return re.sub(r"(?:\s*____)+", " ____", text).strip()


def _question_item(marker: Tag) -> Tag | None:
    return marker.find_parent(class_="ielts-reading-question-item")


def _radio_options(item: Tag | None) -> list[dict]:
    options: list[dict] = []
    if not item:
        return options
    for option in item.select(".ielts-reading-option"):
        control = option.find("input")
        code = _clean(control.get("value") if control else "")
        label = option.select_one(".ielts-reading-option-letter")
        spans = option.find_all("span")
        text = _clean(spans[-1].get_text(" ", strip=True) if spans else "")
        code = code or _clean(label.get_text(" ", strip=True) if label else "")
        if code:
            options.append({"code": code, "text": text or code})
    if options:
        return options
    table = item if item.name == "table" else item.find_parent("table")
    if table:
        headers = [
            _clean(th.get_text())
            for th in table.select("thead th")
            if re.fullmatch(r"[A-I]|[ivxIVX]+", _clean(th.get_text()))
        ]
        for header in headers:
            options.append({"code": header, "text": header})
    return options


def _dnd_options(soup: BeautifulSoup, marker: Tag) -> list[dict]:
    zone = marker.find_parent(attrs={"data-dnd-group": True})
    group = _clean(zone.get("data-dnd-group")) if zone else ""
    if not group:
        return []
    panel = soup.select_one(f'.dnd-panel[data-dnd-group="{group}"]')
    cards = panel.select(".dnd-card") if panel else soup.select(f'.dnd-card[data-dnd-group="{group}"]')
    options: list[dict] = []
    for card in cards:
        code = _clean(card.get("data-value"))
        text_node = card.select_one(".dnd-text")
        text = _clean(text_node.get_text(" ", strip=True) if text_node else card.get("data-text"))
        if not code and text:
            match = re.match(r"^([A-Ia-i]|[ivxlcdm]+)\.?\s+", text, re.I)
            if match:
                code = match.group(1)
                text = _clean(text[match.end() :])
        if code:
            options.append({"code": code, "text": text or code})
    return options


def _heading_paragraph_label(marker: Tag) -> str:
    item = _question_item(marker) or marker
    for sib in item.next_siblings:
        if isinstance(sib, NavigableString):
            continue
        if not isinstance(sib, Tag):
            continue
        if sib.name != "p":
            if "ielts-reading-question-item" in (sib.get("class") or []):
                continue
            break
        strong = sib.find("strong")
        label = _clean(strong.get_text()) if strong else ""
        if re.fullmatch(r"[A-H]", label):
            return f"Paragraph {label}"
        break
    return ""


def _question_prompt(marker: Tag, number: int) -> str:
    heading_label = _heading_paragraph_label(marker)
    if heading_label:
        return heading_label
    item = _question_item(marker)
    if item:
        cell = item.select_one(".ielts-reading-matching-question-cell")
        if cell:
            text = _clone_text(cell, target=number)
            text = re.sub(r"^(?:____|\[\d+\])\s*", "", text).strip()
            if text:
                return text
        direct = _clone_text(item, target=number)
        meaningful = direct.replace("____", "").replace(f"[{number}]", "").strip()
        if len(meaningful) >= 8:
            return re.sub(r"^(?:____|\[\d+\])\s*", "", direct).strip()
    for parent_name in ("li", "td", "p", "tr"):
        parent = marker.find_parent(parent_name)
        if parent:
            text = _clone_text(parent, target=number)
            if text:
                return re.sub(r"^(?:____|\[\d+\])\s*", "", text).strip()
    return f"Question {number}"


def _question_instruction(section: Tag | None) -> str:
    if not section:
        return "Read the passage and answer the question."
    content = section.select_one(".ielts-reading-question-section-content")
    lines: list[str] = []
    if content:
        for node in content.find_all(["p", "h3", "h4"], recursive=True):
            text = _clean(node.get_text(" ", strip=True))
            if not text or "practice this section" in text.lower():
                continue
            if text not in lines:
                lines.append(text)
            if len(lines) >= 4:
                break
    heading = _heading_text(section)
    if heading and heading not in lines:
        lines.insert(0, heading)
    return " ".join(lines) or "Read the passage and answer the question."


def _part_number(marker: Tag | None, section: Tag | None, question_number: int, test_type: str) -> int:
    if marker:
        transcript = marker.find_parent(class_="ielts-reading-transcript")
        if transcript and transcript.get("data-part-number"):
            try:
                return int(transcript.get("data-part-number"))
            except (TypeError, ValueError):
                pass
    if section and section.get("data-part-number"):
        try:
            return int(section.get("data-part-number"))
        except (TypeError, ValueError):
            pass
    if test_type == "general_training":
        if question_number <= 14:
            return 1
        if question_number <= 27:
            return 2
        return 3
    if question_number <= 13:
        return 1
    if question_number <= 26:
        return 2
    return 3


def _is_letter_only_options(options: list[dict]) -> bool:
    return bool(options) and all(opt["code"] == opt["text"] and re.fullmatch(r"[A-H]", opt["code"]) for opt in options)


def _enrich_letter_options(options: list[dict], section: Tag | None) -> list[dict]:
    if not options or not section or not _is_letter_only_options(options):
        return options
    content = section.select_one(".ielts-reading-question-section-content")
    blob = _clean((content or section).get_text(" ", strip=True))
    found: dict[str, str] = {}
    for match in re.finditer(r"\b([A-H])\s*[.)]\s+([A-Za-z][^:]{2,80}?)(?=\s+[A-H]\s*[.)]\s+|\s*$)", blob):
        found[match.group(1)] = _clean(match.group(2))
    if not found:
        return options
    enriched = []
    for opt in options:
        enriched.append({"code": opt["code"], "text": found.get(opt["code"]) or opt["text"]})
    return enriched


def parse_passages(soup: BeautifulSoup, test_id: str, test_dir: Path | None = None) -> list[dict]:
    passages: list[dict] = []
    for index, node in enumerate(soup.select(".ielts-reading-transcript"), 1):
        part = index
        try:
            part = int(node.get("data-part-number") or index)
        except (TypeError, ValueError):
            part = index
        title_node = node.select_one(".ielts-reading-passage-subhead")
        title = _clean(title_node.get_text(" ", strip=True) if title_node else "") or f"Passage {part}"
        paragraphs: list[dict] = []
        pending_label = None
        images: list[str] = []
        for child in node.children:
            if isinstance(child, NavigableString) or not isinstance(child, Tag):
                continue
            classes = child.get("class") or []
            if "ielts-reading-question-item" in classes or "dnd-panel" in classes or "heading-dnd-panel" in classes:
                continue
            if child.name == "img" or child.select_one("img"):
                for img in ([child] if child.name == "img" else child.select("img")):
                    src = PurePosixPath(str(img.get("src") or "")).name
                    if src and src not in images:
                        images.append(src)
            if child.name == "p" and "ielts-reading-passage-subhead" in classes:
                continue
            text = _clean(child.get_text(" ", strip=True))
            if not text:
                continue
            if child.name == "p" and child.find("em") and re.search(r"questions?\s+\d+", text, re.I) and len(text) < 180:
                continue
            strong = child.find("strong") if child.name == "p" else None
            label_only = _clean(strong.get_text()) if strong else ""
            if child.name == "p" and strong and re.fullmatch(r"[A-H]", label_only) and len(text) <= 3:
                pending_label = label_only
                continue
            letter_start = re.match(r"^([A-H])\s+(.+)$", text, re.S)
            if letter_start and not pending_label:
                pending_label = letter_start.group(1)
                text = _clean(letter_start.group(2))
            paragraphs.append(
                {
                    "label": pending_label,
                    "heading": None,
                    "text": text,
                }
            )
            pending_label = None
        if not paragraphs:
            body = _clean(node.get_text(" ", strip=True))
            if title and body.startswith(title):
                body = body[len(title) :].strip()
            paragraphs = [{"label": None, "heading": None, "text": body}]
        passage_id = f"{test_id}-p{part}"
        passage = {
            "id": passage_id,
            "title": title,
            "paragraphs": paragraphs,
        }
        if images and test_dir is not None:
            existing = [name for name in images if (test_dir / "images" / name).is_file()]
            if existing:
                passage["images"] = [f"pack:{test_id}/{name}" for name in existing]
                passage["diagram_asset"] = passage["images"][0]
        passages.append(passage)
    return passages


def parse_questions(
    soup: BeautifulSoup,
    answer_key: list[dict],
    *,
    test_id: str,
    test_type: str,
) -> list[dict]:
    sections = _section_index(soup)
    questions: list[dict] = []
    for row in answer_key:
        try:
            number = int(row.get("question") or 0)
        except (TypeError, ValueError):
            continue
        if number <= 0:
            continue
        marker = soup.find(id=f"ielts-reading-question-number-{number}")
        if not marker:
            marker = next(
                (
                    node
                    for node in soup.select("strong.ielts-reading-question-number")
                    if _clean(node.get_text()) == str(number)
                ),
                None,
            )
        raw_type = _clean(row.get("question_type")).lower()
        qtype = QUESTION_TYPE_MAP.get(raw_type, raw_type or "short_answer")
        section = _section_for(number, sections)
        item = _question_item(marker) if marker else None
        options: list[dict] = []
        if marker and raw_type not in MULTI_SELECT and qtype not in {"true_false_not_given", "yes_no_not_given"}:
            radio = _radio_options(item)
            dnd = _dnd_options(soup, marker)
            if qtype in CHOICE_TYPES:
                options = radio or dnd
                if qtype == "matching_features":
                    options = _enrich_letter_options(options, section)
            elif dnd:
                options = dnd
        variants = _answer_variants(row.get("correct_answer"))
        evidence, explanation = _split_explanation(row.get("explanation") or "")
        part = _part_number(marker, section, number, test_type)
        question = {
            "id": f"{test_id}-q{number:02d}",
            "number": number,
            "passage_id": f"{test_id}-p{part}",
            "type": qtype,
            "instruction": _question_instruction(section) if section else "Read the passage and answer the question.",
            "prompt": _question_prompt(marker, number) if marker else f"Question {number}",
            "answer": variants[0] if variants else "",
            "answer_text": _clean(row.get("correct_answer")),
            "accepted_answers": variants,
            "evidence": evidence,
            "explanation": explanation or None,
        }
        if options:
            question["options"] = options
        questions.append(question)
    questions.sort(key=lambda row: row["number"])
    return questions


def parse_offline_test(test_dir: Path, *, book_id: str, book_title: str, test_type: str) -> dict | None:
    html_path = test_dir / "offline_test.html"
    key_path = test_dir / "answer_key.json"
    if not html_path.exists() or not key_path.exists():
        return None
    meta = {}
    meta_path = test_dir / "metadata.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8-sig"))
    test_number = int(meta.get("test_number") or re.search(r"(\d+)", test_dir.name).group(1))
    test_id = f"{book_id}-reading-test-{test_number:02d}"
    soup = BeautifulSoup(html_path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    answer_key = json.loads(key_path.read_text(encoding="utf-8-sig"))
    if not isinstance(answer_key, list):
        return None
    passages = parse_passages(soup, test_id, test_dir)
    questions = parse_questions(soup, answer_key, test_id=test_id, test_type=test_type)
    if not passages or not questions:
        return None
    used = {q.get("passage_id") for q in questions}
    if used:
        passages = [p for p in passages if p.get("id") in used] or passages
    pack_rel = f"{test_dir.parent.name}/{test_dir.name}"
    return {
        "id": test_id,
        "title": _clean(meta.get("title")) or f"{book_title} Reading Test {test_number:02d}",
        "book_id": book_id,
        "book_title": book_title,
        "test_number": test_number,
        "test_type": test_type,
        "duration_minutes": 60,
        "passage_count": len(passages),
        "question_count": len(questions),
        "source_status": "user_provided_authorized_offline_copy",
        "source_url": meta.get("source"),
        "export_scope": meta.get("export_scope"),
        "production_status": "imported",
        "pack_rel": pack_rel,
        "instructions": [
            "Answer all questions in 60 minutes.",
            "Follow the word limit shown for each completion or short-answer question.",
            "Answers, evidence and explanations remain hidden until you submit.",
        ],
        "passages": passages,
        "questions": questions,
    }


def write_bank_json(pack_dir: Path, track: str | None = None) -> dict:
    folder = pack_dir.name
    track_file = pack_dir / "_track.txt"
    if not track and track_file.exists():
        track = track_file.read_text(encoding="utf-8").strip()
    track = track or infer_track(folder, folder)
    title = book_title(folder, track=track)
    book_id = _slug(folder)
    test_dirs = sorted(path for path in pack_dir.glob("Test_*") if path.is_dir())
    if test_dirs:
        meta_path = test_dirs[0] / "metadata.json"
        if meta_path.exists():
            first = json.loads(meta_path.read_text(encoding="utf-8-sig"))
            title = book_title(folder, first.get("title") or "", track)
    tests = []
    for test_dir in test_dirs:
        parsed = parse_offline_test(test_dir, book_id=book_id, book_title=title, test_type=track)
        if parsed:
            tests.append(parsed)
    tests.sort(key=lambda row: row["test_number"])
    payload = {
        "book_id": book_id,
        "book_title": title,
        "test_type": track,
        "tests": tests,
    }
    (pack_dir / "bank.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def write_all_banks(packs_dir: Path) -> dict:
    books = 0
    tests = 0
    questions = 0
    skipped: list[str] = []
    for pack_dir in sorted(path for path in packs_dir.iterdir() if path.is_dir() and not path.name.startswith("_")):
        payload = write_bank_json(pack_dir)
        count = len(payload.get("tests") or [])
        if not count:
            skipped.append(pack_dir.name)
            continue
        books += 1
        tests += count
        questions += sum(len(test.get("questions") or []) for test in payload["tests"])
    return {"books": books, "tests": tests, "questions": questions, "skipped": skipped}


def extract_bookwise_archive(archive: Path, dest: Path) -> dict:
    dest.mkdir(parents=True, exist_ok=True)
    books = 0
    tests = 0
    with zipfile.ZipFile(archive) as outer:
        for member in outer.namelist():
            if not member.lower().endswith(".zip"):
                continue
            name = PurePosixPath(member).name
            if name.startswith(".") or "__macosx" in member.lower():
                continue
            folder = pack_folder(name)
            track = infer_track(name, folder)
            pack_dir = dest / folder
            pack_dir.mkdir(parents=True, exist_ok=True)
            (pack_dir / "_track.txt").write_text(track, encoding="utf-8")
            with zipfile.ZipFile(outer.open(member)) as inner:
                for inner_name in inner.namelist():
                    if inner_name.endswith("/") or "__macosx" in inner_name.lower() or inner_name.startswith("."):
                        continue
                    relative = flatten_member(inner_name)
                    if not relative or relative.startswith("__"):
                        continue
                    target = pack_dir / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(inner.read(inner_name))
            books += 1
            tests += len(list(pack_dir.glob("Test_*")))
    return {"books": books, "test_folders": tests}


def overlay_answer_keys(archive: Path, dest: Path) -> int:
    copied = 0
    with zipfile.ZipFile(archive) as zf:
        for name in zf.namelist():
            path = name.replace("\\", "/")
            if not path.lower().endswith("answer_key.json"):
                continue
            match = re.search(r"(?:Academic|General)/Reading_([^/]+)/", path)
            test_match = re.search(r"(Test_\d+)", path, re.I)
            if not match or not test_match:
                continue
            folder = match.group(1)
            pack_dir = dest / folder
            if not pack_dir.exists():
                continue
            target = pack_dir / test_match.group(1) / "answer_key.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))
            copied += 1
    return copied
