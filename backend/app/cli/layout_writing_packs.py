"""Arrange writing ZIPs into data/writing-packs and import published questions.

Usage (from backend/):
    python -m app.cli.layout_writing_packs
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
from app.database import SessionLocal, init_db
from app.writing.services.writing_import import import_records
from app.writing_pack_import import extract_bookwise_archive, overlay_model_answers, all_question_records


def _project_root() -> Path:
    return Path(settings.WRITING_BANK_PATH).resolve().parent.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract writing packs into book folders and import them")
    parser.add_argument("--bookwise", default="", help="Academic/General bookwise ZIP")
    parser.add_argument("--models", default="", help="Model answers ZIP")
    parser.add_argument("--skip-import", action="store_true")
    args = parser.parse_args(argv)

    root = _project_root()
    packs = Path(settings.WRITING_PACKS_DIR)
    packs.mkdir(parents=True, exist_ok=True)

    bookwise = Path(args.bookwise) if args.bookwise else next(
        (
            path
            for path in [
                root / "IELTS_Writing_Complete_Academic_General_Bookwise.zip",
                packs / "_archive.zip",
            ]
            if path.exists()
        ),
        None,
    )
    models = Path(args.models) if args.models else next(
        (
            path
            for path in [
                root / "IELTS_Writing_Model_Answers_Pack.zip",
                packs / "_model-answers.zip",
            ]
            if path.exists()
        ),
        None,
    )
    if not bookwise:
        print("Writing bookwise ZIP not found.")
        return 1

    layout = extract_bookwise_archive(bookwise, packs)
    overlay = overlay_model_answers(models, packs) if models else 0

    archive_dest = packs / "_archive.zip"
    if bookwise.resolve() != archive_dest.resolve():
        if archive_dest.exists():
            archive_dest.unlink()
        shutil.move(str(bookwise), str(archive_dest))
    model_dest = packs / "_model-answers.zip"
    if models and models.resolve() != model_dest.resolve():
        if model_dest.exists():
            model_dest.unlink()
        shutil.move(str(models), str(model_dest))

    imported = {}
    if not args.skip_import:
        init_db()
        db = SessionLocal()
        try:
            imported = import_records(
                db,
                all_question_records(packs),
                force_status="published",
                detect_duplicates=False,
            )
            invalid = imported.get("invalid") or []
            imported = {
                **imported,
                "invalid_count": len(invalid),
                "invalid": invalid[:15],
            }
        finally:
            db.close()

    summary = {
        "packs": str(packs),
        "layout": layout,
        "model_answers": overlay,
        "imported": imported,
        "moved": [str(archive_dest), str(model_dest) if models else None],
    }
    print(json.dumps(summary, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
