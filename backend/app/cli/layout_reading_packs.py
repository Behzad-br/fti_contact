"""Arrange reading ZIPs into data/reading-packs and build book catalogs.

Usage (from backend/):
    python -m app.cli.layout_reading_packs
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings
from app.reading_pack_import import extract_bookwise_archive, overlay_answer_keys, write_all_banks


def _project_root() -> Path:
    return Path(settings.READING_BANK_PATH).resolve().parent.parent


def _find_bookwise(root: Path, packs: Path, explicit: str) -> Path | None:
    if explicit:
        path = Path(explicit)
        return path if path.exists() else None
    candidates = [
        *sorted(root.glob("IELTS_Reading_Complete_Bookwise*.zip")),
        packs / "_archive.zip",
    ]
    return next((path for path in candidates if path.exists()), None)


def _find_keys(root: Path, packs: Path, explicit: str) -> Path | None:
    if explicit:
        path = Path(explicit)
        return path if path.exists() else None
    candidates = [
        root / "IELTS_Reading_Answer_Key_Pack.zip",
        packs / "_answer-keys.zip",
    ]
    return next((path for path in candidates if path.exists()), None)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract reading packs into book folders")
    parser.add_argument("--bookwise", default="", help="Bookwise ZIP of offline reading tests")
    parser.add_argument("--keys", default="", help="Answer-key overlay ZIP")
    parser.add_argument("--skip-extract", action="store_true")
    args = parser.parse_args(argv)

    root = _project_root()
    packs = Path(settings.READING_PACKS_DIR)
    packs.mkdir(parents=True, exist_ok=True)

    bookwise = _find_bookwise(root, packs, args.bookwise)
    keys = _find_keys(root, packs, args.keys)
    if not bookwise and not args.skip_extract:
        print("Reading bookwise ZIP not found.")
        return 1

    layout = {"books": 0, "test_folders": 0}
    if bookwise and not args.skip_extract:
        layout = extract_bookwise_archive(bookwise, packs)

    overlay = overlay_answer_keys(keys, packs) if keys else 0
    banks = write_all_banks(packs)

    moved = []
    archive_dest = Path(settings.READING_ARCHIVE_PATH)
    if bookwise and bookwise.resolve() != archive_dest.resolve():
        archive_dest.parent.mkdir(parents=True, exist_ok=True)
        if archive_dest.exists():
            archive_dest.unlink()
        shutil.move(str(bookwise), str(archive_dest))
        moved.append(str(archive_dest))
        extra = root / "IELTS_Reading_Complete_Bookwise (1).zip"
        if extra.exists() and extra.resolve() != archive_dest.resolve():
            extra.unlink()

    key_dest = Path(settings.READING_KEY_ARCHIVE_PATH)
    if keys and keys.resolve() != key_dest.resolve():
        key_dest.parent.mkdir(parents=True, exist_ok=True)
        if key_dest.exists():
            key_dest.unlink()
        shutil.move(str(keys), str(key_dest))
        moved.append(str(key_dest))

    leftover = root / "IELTS_Reading_Answer_Key_Pack.zip"
    if leftover.exists() and leftover.resolve() != key_dest.resolve():
        leftover.unlink()

    summary = {
        "packs": str(packs),
        "layout": layout,
        "answer_keys": overlay,
        "banks": banks,
        "moved": moved,
    }
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
