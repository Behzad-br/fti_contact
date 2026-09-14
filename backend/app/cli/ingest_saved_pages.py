"""Convert dropped HTML/text/JSON in data/imports/raw into bank JSON.

Usage (from backend/):
    python -m app.cli.ingest_saved_pages
"""
from __future__ import annotations

import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import settings
from app.saved_page_ingest import ingest_raw_folder


def main() -> int:
    written = ingest_raw_folder(
        Path(settings.RAW_IMPORT_DIR),
        Path(settings.READING_IMPORT_DIR),
        Path(settings.LISTENING_IMPORT_DIR),
    )
    if not written:
        print(f"No convertible files in {settings.RAW_IMPORT_DIR}")
        print("Drop .html / .txt / .json pages there, then run this command again (or restart the backend).")
        return 0
    for path in written:
        print(f"Wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
