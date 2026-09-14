from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def _pdf_text(text: str) -> str:
    return "(" + text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ")"


def _page_stream(lines: list[str], font_size: int = 14) -> bytes:
    ops = ["BT", f"/F1 {font_size} Tf", "56 740 Td"]
    for index, line in enumerate(lines):
        if index:
            ops.append("0 -20 Td")
        ops.append(f"{_pdf_text(line)} Tj")
    ops.append("ET")
    return "\n".join(ops).encode("latin-1", "replace")


def build_simple_pdf(pages: list[list[str]]) -> bytes:
    """Build a small valid PDF that pypdfium2 can render."""
    streams = [_page_stream(lines) for lines in pages]
    page_count = len(streams)
    font_obj = 3
    first_page = 4
    page_ids = [first_page + i * 2 for i in range(page_count)]
    content_ids = [first_page + i * 2 + 1 for i in range(page_count)]
    kids = " ".join(f"{num} 0 R" for num in page_ids)
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode(),
        font_obj: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    for page_id, content_id, stream in zip(page_ids, content_ids, streams):
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_id} 0 R /Resources << /Font << /F1 {font_obj} 0 R >> >> >>"
        ).encode()
        objects[content_id] = f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj_num in range(1, max(objects) + 1):
        offsets.append(len(out))
        out.extend(f"{obj_num} 0 obj\n".encode())
        out.extend(objects[obj_num])
        out.extend(b"\nendobj\n")
    xref_at = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        out.extend(f"{offset:010d} 00000 n \n".encode())
    out.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    )
    return bytes(out)


def write_sample_pdf(path: Path) -> int:
    pages = [
        [
            "FTI IELTS - Speaking Part 1 sample notes",
            "",
            "Hometown",
            "- Where do you live, and how long have you lived there?",
            "- What do you like most about your area?",
            "- Would you like to live somewhere else in the future?",
            "",
            "Work or study",
            "- Do you work or are you a student?",
            "- What is the most interesting part of your day?",
            "",
            "Useful phrases: these days, in my neighbourhood, as a result.",
        ],
        [
            "How to answer Part 1",
            "",
            "Give a direct answer, then a reason, then a short example.",
            "Keep each answer to about three or four sentences.",
            "",
            "This PDF is a sample class note. It stays locked until the",
            "teacher unlocks it for a batch or for selected students.",
            "Students can read it in the portal only - no download.",
        ],
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(build_simple_pdf(pages))
    return len(pages)


def inspect_pdf(path: Path) -> int:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(str(path))
    count = len(doc)
    doc.close()
    if count < 1:
        raise ValueError("This PDF has no pages.")
    return count


def render_page(path: Path, page_number: int, watermark: str) -> bytes:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument(str(path))
    try:
        if page_number < 1 or page_number > len(doc):
            raise IndexError("Page is out of range.")
        page = doc[page_number - 1]
        bitmap = page.render(scale=1.7)
        image = bitmap.to_pil().convert("RGBA")
    finally:
        doc.close()
    return _stamp(image, watermark)


def _watermark_font(size: int):
    for name in ("arial.ttf", "Arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _stamp(image: Image.Image, text: str) -> bytes:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = _watermark_font(20)
    label = (text or "VIEW ONLY").upper()
    width, height = image.size
    for y in range(-80, height + 80, 150):
        for x in range(-120, width + 120, 340):
            draw.text((x, y), label, fill=(196, 92, 18, 58), font=font)
    stamped = Image.alpha_composite(image, overlay).convert("RGB")
    buf = BytesIO()
    stamped.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
