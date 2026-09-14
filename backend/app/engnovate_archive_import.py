"""Import a user-provided Engnovate offline listening archive.

The outer archive contains one ZIP per book. Each book ZIP contains metadata,
offline HTML, answer keys, transcripts, audio, and optional images.
Large media stays in the source archive and is materialized into a bounded
runtime cache only when requested.
"""
from __future__ import annotations

import io
import json
import re
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any

from bs4 import BeautifulSoup, Tag


QUESTION_TYPE_MAP = {
    "one_choice": "multiple_choice_single",
    "two_choices": "multiple_choice_multiple",
    "three_choices": "multiple_choice_multiple",
    "multiple_choice": "multiple_choice_single",
    "map": "plan_map_diagram_labeling",
    "map_labeling": "plan_map_diagram_labeling",
    "plan": "plan_map_diagram_labeling",
    "plan_labeling": "plan_map_diagram_labeling",
    "diagram": "plan_map_diagram_labeling",
    "diagram_labeling": "plan_map_diagram_labeling",
    "visual_labeling": "plan_map_diagram_labeling",
    "short_answers": "short_answer",
}


def _clean(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("\ufffd", "").replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "book"


def _book_title(filename: str) -> str:
    stem = Path(filename).stem
    number_match = re.search(r"Book[_ -]?(\d+)", stem, re.I)
    number = int(number_match.group(1)) if number_match else None
    low = stem.lower()
    if "cambridge_academic" in low:
        return f"Cambridge IELTS {number} Academic"
    if "collins" in low:
        return f"Collins Practice Tests Book {number}"
    if "ielts_trainer" in low:
        return f"IELTS Trainer Book {number}"
    if "practice_test_plus" in low:
        return f"Practice Tests Plus Book {number}"
    if "recent_actual" in low:
        return f"Recent Actual Tests Book {number}"
    if "barrons" in low:
        return "Barron's Practice Exams Academic"
    if "oxford" in low:
        return "Oxford IELTS Practice Tests Academic"
    return _clean(stem.replace("_", " ").replace("-", " "))


def _answer_variants(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [_clean(item) for item in raw if _clean(item)]
    text = _clean(raw)
    if not text:
        return []
    values = [_clean(item) for item in re.split(r"\s*/\s*", text)]
    return list(dict.fromkeys(item for item in values if item))


def _question_item(marker: Tag) -> Tag | None:
    return marker.find_parent(class_="ielts-listening-question-item")


def _question_options(marker: Tag) -> list[dict]:
    item = _question_item(marker)
    options: list[dict] = []
    if item:
        for option in item.select(".ielts-listening-option"):
            control = option.find("input")
            code = _clean(control.get("value") if control else "")
            label = option.select_one(".ielts-listening-option-letter")
            text_nodes = option.find_all("span")
            text = _clean(text_nodes[-1].get_text(" ", strip=True) if text_nodes else "")
            code = code or _clean(label.get_text(" ", strip=True) if label else "")
            if code and text:
                options.append({"code": code, "text": text})
    if options:
        return options

    group = marker.find_parent(class_="matching-dnd-questions")
    if group and not group.select(".dnd-card"):
        group = marker.find_parent(class_="ielts-listening-questions")
    if group:
        for card in group.select(".dnd-card"):
            code = _clean(card.get("data-value"))
            text_node = card.select_one(".dnd-text")
            text = _clean(text_node.get_text(" ", strip=True) if text_node else card.get("data-text"))
            if code and text:
                options.append({"code": code, "text": text})
    return options


def _clone_text(node: Tag, *, target: int) -> str:
    clone = BeautifulSoup(str(node), "html.parser")
    for remove in clone.select(
        ".ielts-listening-option,.dnd-cards-container,.dnd-panel-instruction,"
        ".dnd-drop-placeholder,.dnd-drop-value"
    ):
        remove.decompose()
    for number in clone.select(".ielts-listening-question-number"):
        value = _clean(number.get_text())
        number.replace_with("____" if value == str(target) else f"[{value}]")
    for control in clone.find_all(["input", "select", "textarea"]):
        control.replace_with("____")
    return _clean(clone.get_text(" ", strip=True)).lstrip("• ").strip()


def _question_prompt(marker: Tag, number: int) -> str:
    def trim_edge_markers(text: str) -> str:
        text = re.sub(r"^(?:(?:____)|(?:\[\d+\]))\s*", "", text)
        return re.sub(r"\s*____$", "", text).strip()

    item = _question_item(marker)
    if item:
        direct = _clone_text(item, target=number)
        meaningful = direct.replace("____", "").replace(f"[{number}]", "").strip()
        if len(meaningful) >= 8:
            return trim_edge_markers(direct)
    for parent_name in ("li", "td", "p", "tr"):
        parent = marker.find_parent(parent_name)
        if parent:
            text = _clone_text(parent, target=number)
            if text:
                return trim_edge_markers(text)
    return f"Question {number}"


def _question_instruction(marker: Tag) -> str:
    part = marker.find_parent(attrs={"data-part-number": True})
    content = marker.find_previous("div", class_="ielts-listening-question-section-content")
    if not content or (part and content.find_parent(attrs={"data-part-number": True}) != part):
        return "Listen and answer the question."
    lines = []
    for node in content.find_all(["p", "h3"], recursive=True):
        text = _clean(node.get_text(" ", strip=True))
        if text and len(text) <= 240 and text not in lines:
            lines.append(text)
        if len(lines) >= 3:
            break
    return " ".join(lines) or "Listen and answer the question."


def _part_number(marker: Tag | None, question_number: int) -> int:
    if marker:
        section = marker.find_parent(attrs={"data-part-number": True})
        if section:
            try:
                return int(section.get("data-part-number"))
            except (TypeError, ValueError):
                pass
    return min(4, max(1, ((question_number - 1) // 10) + 1))


def _question_from_key(soup: BeautifulSoup, row: dict, test_id: str) -> dict:
    number = int(row.get("question") or 0)
    marker = soup.find(id=f"ielts-listening-question-number-{number}")
    if not marker:
        marker = next(
            (
                node
                for node in soup.select(".ielts-listening-question-number")
                if _clean(node.get_text()) == str(number)
            ),
            None,
        )
    if not marker:
        marker = soup.find(attrs={"aria-label": re.compile(rf"^Question\s+{number}$", re.I)})
    raw_type = _clean(row.get("question_type")).lower()
    qtype = QUESTION_TYPE_MAP.get(raw_type, raw_type or "short_answer")
    options = _question_options(marker) if marker else []
    if options and qtype not in {"multiple_choice_multiple", "matching"}:
        qtype = "multiple_choice_single"

    variants = _answer_variants(row.get("correct_answer"))
    is_multi = qtype == "multiple_choice_multiple"
    answer: str | list[str] = variants if is_multi else (variants[0] if variants else "")
    item = _question_item(marker) if marker else None
    group_numbers = []
    if item:
        group_numbers = [
            int(_clean(node.get_text()))
            for node in item.select(".ielts-listening-question-number")
            if _clean(node.get_text()).isdigit()
        ]

    part_number = _part_number(marker, number)
    question = {
        "id": f"{test_id}-q{number:02d}",
        "number": number,
        "part_number": part_number,
        "part_id": f"{test_id}-part-{part_number}",
        "type": qtype,
        "instruction": _question_instruction(marker) if marker else "Listen and answer the question.",
        "prompt": _question_prompt(marker, number) if marker else f"Question {number}",
        "answer": answer,
        "answer_text": _clean(row.get("correct_answer")),
        "accepted_answers": variants,
        "evidence": _clean(row.get("evidence_excerpt")) or None,
        "source_locator": {"section_id": row.get("section_id")},
    }
    if options:
        question["options"] = options
    if len(group_numbers) > 1:
        question["group_id"] = f"{test_id}-group-{min(group_numbers):02d}"
        question["group_numbers"] = group_numbers
    return question


def _find_member(book_zip: zipfile.ZipFile, test_dir: str, suffix: str) -> str | None:
    exact = f"{test_dir}/{suffix}"
    if exact in book_zip.namelist():
        return exact
    suffix_low = suffix.lower()
    return next(
        (
            name
            for name in book_zip.namelist()
            if name.startswith(f"{test_dir}/") and name.lower().endswith(suffix_low)
        ),
        None,
    )


SKIP_EXTRACT_SUFFIXES = {".mp3", ".zip", ".crdownload"}


def pack_stem(container: str) -> str:
    stem = PurePosixPath(container).stem
    return re.sub(r"\s*\(\d+\)$", "", stem)


def flatten_member(member: str) -> str:
    parts = list(PurePosixPath(member).parts)
    if parts and re.match(r"(?i)book_\d+$", parts[0]):
        parts = parts[1:]
    elif len(parts) > 1 and re.match(r"(?i)test_\d+$", parts[1]):
        parts = parts[1:]
    return str(PurePosixPath(*parts)) if parts else member


def pack_relative(container: str, member: str) -> str:
    return str(PurePosixPath(pack_stem(container)) / flatten_member(member))


def _asset_entry(container: str, member: str, kind: str) -> dict:
    return {
        "container": container,
        "member": member,
        "file": pack_relative(container, member).replace("\\", "/"),
        "kind": kind,
    }


def _parse_test(
    book_zip: zipfile.ZipFile,
    *,
    container: str,
    metadata_member: str,
    book_id: str,
    book_title: str,
    asset_index: dict,
) -> dict:
    metadata = json.loads(book_zip.read(metadata_member).decode("utf-8-sig"))
    test_dir = str(PurePosixPath(metadata_member).parent)
    test_number = int(metadata.get("test_number") or 1)
    test_id = f"{book_id}-listening-test-{test_number:02d}"
    html_member = _find_member(book_zip, test_dir, "offline_test.html")
    key_member = _find_member(book_zip, test_dir, "answer_key.json")
    if not html_member or not key_member:
        raise ValueError(f"{test_dir}: offline_test.html or answer_key.json missing")

    html = book_zip.read(html_member).decode("utf-8", "replace")
    soup = BeautifulSoup(html, "html.parser")
    answer_key = json.loads(book_zip.read(key_member).decode("utf-8-sig"))
    questions = [_question_from_key(soup, row, test_id) for row in answer_key]
    questions.sort(key=lambda row: row["number"])

    parts = []
    inner_names = set(book_zip.namelist())
    for part_number in range(1, 5):
        part_id = f"{test_id}-part-{part_number}"
        audio_member = f"{test_dir}/audio/part_{part_number}.mp3"
        audio_name = f"{test_id}-part-{part_number}.mp3"
        if audio_member in inner_names:
            asset_index[audio_name] = _asset_entry(container, audio_member, "audio")

        transcript_member = f"{test_dir}/transcript_part_{part_number}.txt"
        transcript = ""
        if transcript_member in inner_names:
            transcript = book_zip.read(transcript_member).decode("utf-8", "replace")

        section = soup.find(attrs={"data-part-number": str(part_number)})
        visual_names = []
        if section:
            parent = section.find_parent("section", class_="part") or section
            for image in parent.find_all("img"):
                src = PurePosixPath(str(image.get("src") or "")).name
                member = f"{test_dir}/images/{src}"
                if src and member in inner_names:
                    ext = PurePosixPath(src).suffix.lower() or ".jpg"
                    virtual = f"{test_id}-part-{part_number}-image-{len(visual_names) + 1}{ext}"
                    asset_index[virtual] = _asset_entry(container, member, "image")
                    visual_names.append(virtual)

        part = {
            "id": part_id,
            "part_number": part_number,
            "title": f"Part {part_number}",
            "context": f"Questions {(part_number - 1) * 10 + 1}–{part_number * 10}",
            "setting": "imported_offline_test",
            "audio_asset": f"audio/{audio_name}" if audio_member in inner_names else "",
            "transcript": _clean(transcript),
        }
        if visual_names:
            part["visual_asset"] = f"maps/{visual_names[0]}"
            part["visual_assets"] = [f"maps/{name}" for name in visual_names]
        parts.append(part)

    counts = Counter(question["part_number"] for question in questions)
    for part in parts:
        part["question_count"] = counts.get(part["part_number"], 0)

    return {
        "id": test_id,
        "title": _clean(metadata.get("title")) or f"{book_title} Listening Test {test_number}",
        "book_id": book_id,
        "book_title": book_title,
        "test_number": test_number,
        "duration_minutes": 30,
        "part_count": 4,
        "question_count": len(questions),
        "source_status": "user_provided_authorized_offline_copy",
        "source_url": metadata.get("source"),
        "export_scope": metadata.get("export_scope"),
        "production_status": "imported",
        "audio_status": "licensed_audio_from_user_archive",
        "instructions": [
            "Listen to each recording and answer all 40 questions.",
            "Answers and transcripts remain hidden until submission.",
        ],
        "parts": parts,
        "questions": questions,
    }


def import_archive(
    archive_path: Path,
    output_dir: Path,
    asset_index_path: Path,
) -> dict:
    """Convert every valid nested book ZIP and write one bank JSON per book."""
    archive_path = archive_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    asset_index: dict[str, dict] = {}
    report = {
        "archive": str(archive_path),
        "books": 0,
        "tests": 0,
        "questions": 0,
        "audio_assets": 0,
        "image_assets": 0,
        "skipped": [],
        "outputs": [],
    }

    with zipfile.ZipFile(archive_path) as outer:
        containers = sorted(name for name in outer.namelist() if name.lower().endswith(".zip"))
        for container in containers:
            try:
                nested_bytes = outer.read(container)
                with zipfile.ZipFile(io.BytesIO(nested_bytes)) as book_zip:
                    metadata_members = sorted(
                        name
                        for name in book_zip.namelist()
                        if name.lower().endswith("/metadata.json")
                    )
                    if not metadata_members:
                        report["skipped"].append({"book": container, "reason": "No test metadata"})
                        continue
                    book_title = _book_title(PurePosixPath(container).name)
                    book_id = _slug(book_title)
                    tests = []
                    for metadata_member in metadata_members:
                        try:
                            tests.append(
                                _parse_test(
                                    book_zip,
                                    container=container,
                                    metadata_member=metadata_member,
                                    book_id=book_id,
                                    book_title=book_title,
                                    asset_index=asset_index,
                                )
                            )
                        except Exception as exc:
                            report["skipped"].append(
                                {"book": container, "test": metadata_member, "reason": str(exc)}
                            )
                    if not tests:
                        continue
                    tests.sort(key=lambda row: row["test_number"])
                    payload = {
                        "meta": {
                            "book_id": book_id,
                            "book_title": book_title,
                            "source_archive": archive_path.name,
                            "source_status": "user_provided_authorized_offline_copy",
                        },
                        "tests": tests,
                    }
                    destination = output_dir / pack_stem(container) / "bank.json"
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    report["outputs"].append(str(destination))
                    report["books"] += 1
                    report["tests"] += len(tests)
                    report["questions"] += sum(len(test["questions"]) for test in tests)
            except (OSError, zipfile.BadZipFile, KeyError) as exc:
                report["skipped"].append({"book": container, "reason": str(exc)})

    index_payload = {
        "archive": str(archive_path),
        "packs_dir": str(output_dir),
        "assets": asset_index,
    }
    asset_index_path.parent.mkdir(parents=True, exist_ok=True)
    asset_index_path.write_text(
        json.dumps(index_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    report["audio_assets"] = sum(1 for row in asset_index.values() if row["kind"] == "audio")
    report["image_assets"] = sum(1 for row in asset_index.values() if row["kind"] == "image")
    return report


def extract_pack_layout(
    archive_path: Path,
    packs_dir: Path,
    *,
    bank_json_dir: Path | None = None,
    archive_dest: Path | None = None,
) -> dict:
    """Extract book/test folders from the outer ZIP and drop extra files."""
    archive_path = archive_path.resolve()
    packs_dir.mkdir(parents=True, exist_ok=True)
    extracted = 0
    skipped_media = 0
    books = 0

    with zipfile.ZipFile(archive_path) as outer:
        for container in sorted(name for name in outer.namelist() if name.lower().endswith(".zip")):
            stem = pack_stem(container)
            if "book_wise_index" in stem.lower() or "index" == stem.lower():
                continue
            try:
                nested = zipfile.ZipFile(io.BytesIO(outer.read(container)))
            except (OSError, zipfile.BadZipFile, KeyError):
                continue
            books += 1
            book_dir = packs_dir / stem
            book_dir.mkdir(parents=True, exist_ok=True)
            for info in nested.infolist():
                if info.is_dir():
                    continue
                suffix = Path(info.filename).suffix.lower()
                if suffix in SKIP_EXTRACT_SUFFIXES:
                    skipped_media += 1
                    continue
                relative = flatten_member(info.filename)
                destination = book_dir / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(nested.read(info.filename))
                extracted += 1

    if bank_json_dir and bank_json_dir.is_dir():
        for path in sorted(bank_json_dir.glob("engnovate-*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            book_id = (payload.get("meta") or {}).get("book_id") or path.stem.replace("engnovate-", "")
            target_dir = None
            for folder in packs_dir.iterdir():
                if not folder.is_dir() or folder.name.startswith("_"):
                    continue
                if _slug(_book_title(folder.name + ".zip")) == book_id:
                    target_dir = folder
                    break
            if target_dir is None:
                continue
            target = target_dir / "bank.json"
            if not target.exists():
                path.replace(target)
            else:
                path.unlink()

    final_archive = archive_dest or (packs_dir / "_archive.zip")
    final_archive.parent.mkdir(parents=True, exist_ok=True)
    if archive_path != final_archive.resolve():
        if final_archive.exists():
            final_archive.unlink()
        archive_path.replace(final_archive)

    return {
        "books": books,
        "extracted_files": extracted,
        "kept_in_archive": skipped_media,
        "archive": str(final_archive),
        "packs_dir": str(packs_dir),
    }

