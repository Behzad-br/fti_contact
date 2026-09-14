"""Import a user-provided Engnovate offline listening archive.

Usage (from backend/):
    python -m app.cli.import_engnovate_archive "../egnovate listing.zip"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings
from app.engnovate_archive_import import import_archive


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import offline listening books")
    parser.add_argument("archive", help="Path to the outer ZIP archive")
    args = parser.parse_args(argv)
    archive = Path(args.archive)
    if not archive.exists():
        print(f"Archive not found: {archive}")
        return 1

    report = import_archive(
        archive,
        Path(settings.LISTENING_PACKS_DIR),
        Path(settings.LISTENING_ARCHIVE_ASSET_INDEX),
    )
    print(json.dumps(report, indent=2))
    return 0 if report["tests"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
