"""Arrange the Engnovate ZIP into data/listening-packs book folders.

Usage (from backend/):
    python -m app.cli.layout_listening_packs "../egnovate listing.zip"
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
from app.engnovate_archive_import import extract_pack_layout, import_archive


def _delete_extras() -> list[str]:
    removed = []
    extras = [
        Path(settings.LISTENING_IMPORT_DIR) / "_engnovate-import-report.json",
        Path(settings.LISTENING_IMPORT_DIR) / "_archive-assets.json",
        Path(settings.LISTENING_ARCHIVE_CACHE_DIR),
    ]
    for path in extras:
        if path.is_file():
            path.unlink()
            removed.append(str(path))
        elif path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
            removed.append(str(path))
    for leftover in Path(settings.LISTENING_IMPORT_DIR).glob("engnovate-*.json"):
        leftover.unlink()
        removed.append(str(leftover))
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract listening packs into book folders")
    parser.add_argument("archive", nargs="?", default="", help="Outer ZIP path")
    args = parser.parse_args(argv)
    candidates = [
        Path(args.archive) if args.archive else None,
        Path(settings.LISTENING_ARCHIVE_PATH),
        Path(__file__).resolve().parents[3] / "egnovate listing.zip",
    ]
    archive = next((path for path in candidates if path and path.exists()), None)
    if not archive:
        print("Archive not found. Put it at data/listening-packs/_archive.zip or project root.")
        return 1

    packs = Path(settings.LISTENING_PACKS_DIR)
    layout = extract_pack_layout(
        archive,
        packs,
        bank_json_dir=Path(settings.LISTENING_IMPORT_DIR),
        archive_dest=Path(settings.LISTENING_ARCHIVE_PATH),
    )
    report = import_archive(
        Path(settings.LISTENING_ARCHIVE_PATH),
        packs,
        Path(settings.LISTENING_ARCHIVE_ASSET_INDEX),
    )
    removed = _delete_extras()
    summary = {**layout, "bank_files": report["books"], "removed": removed}
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
