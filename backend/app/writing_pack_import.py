"""Layout a user-provided Engnovate writing archive into data/writing-packs."""
from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

from bs4 import BeautifulSoup

from app.config import settings


JUNK = re.compile(r"SamplesWords:\s*0More Samples:|More Samples:|SamplesWords:\s*0", re.I)
BOOK_DIR = re.compile(r"(?i)^book_\d+$")
TEST_DIR = re.compile(r"(?i)^test_\d+$")


def _clean(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\ufffd", "•").replace("\u00a0", " ")
    text = JUNK.sub("", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "book"


def pack_folder(zip_name: str) -> str:
    stem = PurePosixPath(zip_name).stem
    stem = re.sub(r"^Writing_", "", stem, flags=re.I)
    return stem


def book_title(folder: str, metadata_title: str = "", track: str = "academic") -> str:
    if metadata_title:
        cleaned = re.sub(r"\s+Writing Test\s+\d+\s*$", "", metadata_title, flags=re.I).strip()
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
    return _clean(folder.replace("-", " ").replace("_", " "))


def flatten_member(member: str) -> str:
    parts = list(PurePosixPath(member).parts)
    if parts and BOOK_DIR.match(parts[0]):
        parts = parts[1:]
    elif len(parts) > 1 and TEST_DIR.match(str(parts[1])):
        parts = parts[1:]
    return str(PurePosixPath(*parts)) if parts else member


def _stored_path(path: Path) -> str | None:
    if not path.exists():
        return None
    root = Path(settings.WRITING_PACKS_DIR).resolve().parent.parent
    try:
        return path.resolve().relative_to(root).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def infer_question_type(task: int, text: str, test_type: str) -> str:
    low = text.lower()
    if task == 1:
        if test_type == "general_training" or "write a letter" in low:
            if any(token in low for token in ("dear sir", "dear madam", "to whom")):
                return "formal_letter"
            if any(token in low for token in ("friend", "dear mum", "dear dad")):
                return "informal_letter"
            return "semi_formal_letter"
        if "pie chart" in low:
            return "pie_chart"
        if "bar chart" in low:
            return "bar_chart"
        if "table" in low:
            return "table"
        if re.search(r"\bmaps?\b", low):
            return "map"
        if "process" in low or ("diagram" in low and "how" in low):
            return "process"
        if "diagram" in low:
            return "process"
        if "line graph" in low or "the graph" in low or "graph below" in low:
            return "line_graph"
        return "mixed_chart"
    if "to what extent" in low or "agree or disagree" in low or "agree and disagree" in low:
        return "agree_disagree"
    if "discuss both" in low:
        return "discuss_both_views"
    if "advantage" in low and "disadvantage" in low:
        return "advantages_disadvantages"
    if "positive" in low and "negative" in low:
        return "positive_negative"
    if ("problem" in low and "solution" in low) or ("cause" in low and "solution" in low):
        return "problem_solution"
    if low.count("?") >= 2 or ("why" in low and ("what" in low or "how" in low)):
        return "two_part"
    return "opinion"


def infer_letter_fields(text: str, qtype: str) -> tuple[str | None, str | None, list[str]]:
    if qtype not in {"formal_letter", "semi_formal_letter", "informal_letter"}:
        return None, None, []
    tone = "formal" if qtype == "formal_letter" else "informal" if qtype == "informal_letter" else "semi-formal"
    bullets = []
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^[•\-–]\s+", stripped) or re.match(r"^[•]", stripped):
            bullets.append(re.sub(r"^[•\-–]\s*", "", stripped).strip())
    recipient = None
    low = text.lower()
    if "manager" in low:
        recipient = "manager"
    elif "boss" in low:
        recipient = "boss"
    elif "friend" in low:
        recipient = "friend"
    return tone, recipient, bullets


def _chart_images(html: str, test_dir: Path) -> list[str]:
    names: list[str] = []
    if html:
        soup = BeautifulSoup(html, "html.parser")
        for img in soup.select("img.ielts-writing-image, .ielts-writing-question-section img"):
            src = PurePosixPath(str(img.get("src") or "")).name
            if src and src not in names:
                names.append(src)
        if not names:
            for img in soup.select("img"):
                src = PurePosixPath(str(img.get("src") or "")).name
                if src and src.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")) and src not in names:
                    names.append(src)
    img_dir = test_dir / "images"
    if img_dir.is_dir() and not names:
        names = sorted(
            p.name
            for p in img_dir.iterdir()
            if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}
        )
    return names


def _questions_from_test(test_dir: Path, *, book_id: str, book_title: str, test_type: str) -> dict:
    meta = json.loads((test_dir / "metadata.json").read_text(encoding="utf-8-sig"))
    prompts = json.loads((test_dir / "writing_prompts.json").read_text(encoding="utf-8-sig"))
    html = (test_dir / "offline_test.html").read_text(encoding="utf-8", errors="replace") if (test_dir / "offline_test.html").exists() else ""
    images = _chart_images(html, test_dir)
    test_number = int(meta.get("test_number") or re.search(r"(\d+)", test_dir.name).group(1))
    pack_test_id = f"{book_id}-test-{test_number:02d}"
    questions = []
    for row in prompts:
        task = int(row.get("task") or 1)
        prompt = _clean(row.get("text") or row.get("prompt") or "")
        if not prompt:
            continue
        qtype = infer_question_type(task, prompt, test_type)
        tone, recipient, bullets = infer_letter_fields(prompt, qtype)
        image_path = None
        extra: list[str] = []
        if task == 1 and images:
            main = images[0]
            candidate = test_dir / "images" / main
            image_path = _stored_path(candidate)
            extra = [
                stored
                for name in images[1:]
                if (stored := _stored_path(test_dir / "images" / name))
            ]
        visual = None
        if image_path:
            visual = {"extra_images": extra, "image_only": True}
        elif task == 1 and test_type == "academic":
            visual = {"image_only": True}
        questions.append(
            {
                "id": f"{pack_test_id}-task{task}",
                "test_type": test_type,
                "task": task,
                "question_type": qtype,
                "title": meta.get("title") or f"{book_title} Test {test_number:02d}",
                "topic": book_title,
                "prompt": prompt,
                "minimum_words": 150 if task == 1 else 250,
                "recommended_minutes": 20 if task == 1 else 40,
                "letter_tone": tone,
                "recipient": recipient,
                "bullet_points": bullets,
                "source_type": "imported_original",
                "source_reference": meta.get("source"),
                "publication_status": "published",
                "generated_by_ai": False,
                "image_path": image_path,
                "visual_data": visual,
                "book_id": book_id,
                "book_title": book_title,
                "test_number": test_number,
                "pack_test_id": pack_test_id,
            }
        )
    questions.sort(key=lambda q: q["task"])
    return {
        "id": pack_test_id,
        "title": meta.get("title") or f"{book_title} Test {test_number:02d}",
        "book_id": book_id,
        "book_title": book_title,
        "test_number": test_number,
        "test_type": test_type,
        "duration_minutes": 60,
        "questions": questions,
        "model_answers": (test_dir / "model_answers.md").read_text(encoding="utf-8", errors="replace") if (test_dir / "model_answers.md").exists() else None,
    }


def write_bank_json(pack_dir: Path, track: str | None = None) -> dict:
    tests = []
    folder = pack_dir.name
    track_file = pack_dir / "_track.txt"
    if not track and track_file.exists():
        track = track_file.read_text(encoding="utf-8").strip()
    track = track or ("academic" if "academic" in folder.lower() else "general_training")
    title = book_title(folder, track=track)
    book_id = _slug(folder)
    test_dirs = sorted(pack_dir.glob("Test_*"))
    if test_dirs and (test_dirs[0] / "metadata.json").exists():
        first = json.loads((test_dirs[0] / "metadata.json").read_text(encoding="utf-8-sig"))
        title = book_title(folder, first.get("title") or "", track)
    for test_dir in test_dirs:
        if not (test_dir / "writing_prompts.json").exists():
            continue
        tests.append(_questions_from_test(test_dir, book_id=book_id, book_title=title, test_type=track))
    tests.sort(key=lambda t: t["test_number"])
    payload = {
        "book_id": book_id,
        "book_title": title,
        "test_type": track,
        "tests": tests,
    }
    (pack_dir / "bank.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def extract_bookwise_archive(archive: Path, dest: Path) -> dict:
    dest.mkdir(parents=True, exist_ok=True)
    books = 0
    tests = 0
    with zipfile.ZipFile(archive) as outer:
        for member in outer.namelist():
            if not member.lower().endswith(".zip"):
                continue
            track = "academic" if member.replace("\\", "/").startswith("Academic/") else "general_training"
            folder = pack_folder(member)
            pack_dir = dest / folder
            pack_dir.mkdir(parents=True, exist_ok=True)
            (pack_dir / "_track.txt").write_text(track, encoding="utf-8")
            with zipfile.ZipFile(outer.open(member)) as inner:
                for name in inner.namelist():
                    if name.endswith("/"):
                        continue
                    relative = flatten_member(name)
                    target = pack_dir / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(inner.read(name))
            books += 1
            tests += len(list(pack_dir.glob("Test_*")))
            write_bank_json(pack_dir, track)
    return {"books": books, "test_folders": tests}


def overlay_model_answers(archive: Path, dest: Path) -> int:
    copied = 0
    with zipfile.ZipFile(archive) as zf:
        for name in zf.namelist():
            if not name.lower().endswith("model_answers.md"):
                continue
            match = re.search(
                r"(?:Academic|General)(?:_Writing_|/Writing_)([^/]+)",
                name.replace("\\", "/"),
            )
            test_match = re.search(r"(Test_\d+)", name, re.I)
            if not match or not test_match:
                continue
            folder = match.group(1)
            test_name = test_match.group(1)
            pack_dir = dest / folder
            if not pack_dir.exists():
                continue
            target = pack_dir / test_name / "model_answers.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(name))
            copied += 1
    for pack_dir in dest.iterdir():
        if not pack_dir.is_dir() or pack_dir.name.startswith("_"):
            continue
        if list(pack_dir.glob("Test_*")):
            write_bank_json(pack_dir)
    return copied


def all_question_records(packs_dir: Path) -> list[dict]:
    rows = []
    for bank in sorted(packs_dir.glob("*/bank.json")):
        payload = json.loads(bank.read_text(encoding="utf-8"))
        for test in payload.get("tests") or []:
            rows.extend(test.get("questions") or [])
    return rows
