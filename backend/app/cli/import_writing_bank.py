"""
Import the IELTS Writing starter bank.

Usage (from backend/):
    python -m app.cli.import_writing_bank
    python -m app.cli.import_writing_bank path/to/ielts_writing_starter_bank_150.json
    python -m app.cli.import_writing_bank --dry-run
    python -m app.cli.import_writing_bank --publish
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings
from app.database import SessionLocal, init_db
from app.writing.services.writing_import import import_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import IELTS Writing question bank")
    parser.add_argument("path", nargs="?", default=settings.WRITING_BANK_PATH, help="JSON or CSV file")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Import as published (default keeps draft_review_required as review)",
    )
    args = parser.parse_args(argv)

    path = Path(args.path)
    if not path.exists():
        print(f"File not found: {path}")
        return 1

    init_db()
    db = SessionLocal()
    try:
        result = import_file(
            db,
            path,
            dry_run=args.dry_run,
            force_status="published" if args.publish else None,
        )
        print(f"Imported: {result['imported']}")
        print(f"Skipped (duplicate IDs): {result['skipped']}")
        print(f"Invalid: {len(result['invalid'])}")
        print(f"Possible duplicates flagged: {result['duplicate_flagged']}")
        for item in result["invalid"][:20]:
            print(f"  - {item}")
        if args.dry_run:
            print("Dry run — no rows written.")
        return 0 if not result["invalid"] else 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
