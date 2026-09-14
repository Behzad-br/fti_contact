"""Inspect uploaded class notes and render watermarked page images."""
from __future__ import annotations

import re
import zipfile
from pathlib import Path
from textwrap import wrap
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

from app.notes import pdf as pdf_mod

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".xlsx",
    ".xls",
}

ALLOWED_LABEL = "PDF, Word, PowerPoint, Excel, text, or images (PNG, JPG, WebP)"

BLOCKED_EXTENSIONS = {
    ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".scr", ".ps1", ".js",
    ".jar", ".apk", ".sh", ".vbs", ".wsf", ".cpl", ".pif",
}

MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}

_PAGE_W, _PAGE_H = 850, 1100
_LINE_WIDTH = 86
_LINES_PER_PAGE = 32


def extension_of(name: str) -> str:
    return Path(name or "").suffix.lower()


def file_kind(name: str) -> str:
    ext = extension_of(name).lstrip(".")
    return ext or "file"


def media_type_for(name: str) -> str:
    return MIME_BY_EXT.get(extension_of(name), "application/octet-stream")


def is_allowed_filename(name: str) -> bool:
    ext = extension_of(name)
    if not ext or ext in BLOCKED_EXTENSIONS:
        return False
    return ext in ALLOWED_EXTENSIONS


def inspect_document(path: Path) -> int:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return pdf_mod.inspect_pdf(path)
    pages = _content_pages(path)
    return max(1, len(pages))


def render_page(path: Path, page_number: int, watermark: str) -> bytes:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return pdf_mod.render_page(path, page_number, watermark)
    if ext in {".png", ".jpg", ".jpeg", ".webp"}:
        if page_number != 1:
            raise IndexError("Page is out of range.")
        return _render_image(path, watermark)
    pages = _content_pages(path)
    if page_number < 1 or page_number > len(pages):
        raise IndexError("Page is out of range.")
    return _render_text_page(pages[page_number - 1], watermark, heading=path.name)


def _content_pages(path: Path) -> list[list[str]]:
    ext = path.suffix.lower()
    try:
        if ext == ".txt":
            chunks = _paginate(_read_text_file(path))
        elif ext == ".docx":
            chunks = _paginate(_extract_docx(path))
        elif ext == ".pptx":
            chunks = _extract_pptx_slides(path)
        elif ext == ".xlsx":
            chunks = _paginate(_extract_xlsx(path))
        elif ext in {".doc", ".ppt", ".xls"}:
            chunks = _paginate(_extract_ole_text(path))
        else:
            chunks = [["This document was uploaded.", "Open it in the portal to read the extracted text."]]
    except Exception:
        chunks = [[
            f"Uploaded file: {path.name}",
            "",
            "This document is stored and locked until your teacher unlocks it.",
            "A full layout preview is not available, so this is a protected placeholder page.",
        ]]
    return chunks or [["(This document has no extractable text.)"]]


def _read_text_file(path: Path) -> list[str]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1", "replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def _extract_docx(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for para in root.iter():
        if not para.tag.endswith("}p"):
            continue
        parts = [node.text or "" for node in para.iter() if node.tag.endswith("}t")]
        line = "".join(parts).strip()
        lines.append(line)
    return lines or ["(This Word document has no extractable text.)"]


def _extract_pptx_slides(path: Path) -> list[list[str]]:
    pages: list[list[str]] = []
    with zipfile.ZipFile(path) as archive:
        slides = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml") and "/_rels/" not in name
        )
        for index, name in enumerate(slides, start=1):
            root = ET.fromstring(archive.read(name))
            texts = [node.text.strip() for node in root.iter() if node.tag.endswith("}t") and node.text and node.text.strip()]
            pages.extend(_paginate([f"Slide {index}"] + (texts or ["(Empty slide)"])))
    return pages or [["(This PowerPoint file has no extractable slides.)"]]


def _extract_xlsx(path: Path) -> list[str]:
    lines: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        strings: list[str] = []
        if "xl/sharedStrings.xml" in names:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root:
                if not item.tag.endswith("}si"):
                    continue
                strings.append("".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")).strip())
        sheets = sorted(name for name in names if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
        for sheet in sheets:
            lines.append(f"-- {Path(sheet).stem} --")
            root = ET.fromstring(archive.read(sheet))
            for cell in root.iter():
                if not cell.tag.endswith("}c"):
                    continue
                value = next((node.text for node in cell if node.tag.endswith("}v") and node.text), None)
                if value is None:
                    continue
                if cell.attrib.get("t") == "s":
                    try:
                        lines.append(strings[int(value)])
                    except (ValueError, IndexError):
                        continue
                elif value.strip():
                    lines.append(value.strip())
    cleaned = [line for line in lines if line]
    return cleaned or ["(This spreadsheet has no extractable text.)"]


def _extract_ole_text(path: Path) -> list[str]:
    raw = path.read_bytes()[:2_000_000]
    chunks: list[str] = []
    for match in re.finditer(rb"[\x20-\x7e]{6,}", raw):
        chunks.append(match.group().decode("ascii"))
    text = re.sub(r"\s+", " ", " ".join(chunks)).strip()
    if len(text) < 24:
        return [
            f"Uploaded file: {path.name}",
            "",
            "This is a legacy Office file. A limited text extract is shown here.",
            "Your teacher can still unlock it for your batch or for you.",
        ]
    return wrap(text, _LINE_WIDTH)


def _paginate(lines: list[str]) -> list[list[str]]:
    wrapped: list[str] = []
    for line in lines:
        if line is None:
            continue
        text = str(line)
        if text == "":
            wrapped.append("")
            continue
        wrapped.extend(wrap(text, _LINE_WIDTH) or [""])
    if not wrapped:
        wrapped = ["(This document has no extractable text.)"]
    return [wrapped[i:i + _LINES_PER_PAGE] for i in range(0, len(wrapped), _LINES_PER_PAGE)]


def _body_font(size: int):
    for name in ("arial.ttf", "Arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _render_text_page(lines: list[str], watermark: str, heading: str = "") -> bytes:
    image = Image.new("RGB", (_PAGE_W, _PAGE_H), (252, 250, 246))
    draw = ImageDraw.Draw(image)
    title_font = _body_font(15)
    body_font = _body_font(16)
    y = 36
    if heading:
        draw.text((48, y), heading[:90], fill=(120, 90, 40), font=title_font)
        y += 36
        draw.line((48, y, _PAGE_W - 48, y), fill=(230, 214, 186), width=1)
        y += 18
    for line in lines:
        draw.text((48, y), line, fill=(32, 28, 24), font=body_font)
        y += 28
        if y > _PAGE_H - 48:
            break
    return pdf_mod._stamp(image.convert("RGBA"), watermark)


def _render_image(path: Path, watermark: str) -> bytes:
    image = Image.open(path).convert("RGBA")
    max_w = 1400
    if image.width > max_w:
        height = int(image.height * (max_w / image.width))
        image = image.resize((max_w, max(1, height)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", image.size, (255, 255, 255, 255))
    canvas.alpha_composite(image)
    return pdf_mod._stamp(canvas, watermark)
