"""Serve listening media from extracted pack folders, with ZIP fallback."""
from __future__ import annotations

import io
import json
import logging
import os
import zipfile
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)
MAX_CACHE_BYTES = 900 * 1024 * 1024


def _load_index() -> dict:
    path = Path(settings.LISTENING_ARCHIVE_ASSET_INDEX)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.error("Cannot read archive asset index %s: %s", path, exc)
        return {}


def _evict(cache_dir: Path, incoming: int = 0) -> None:
    files = [path for path in cache_dir.glob("*") if path.is_file()]
    total = sum(path.stat().st_size for path in files)
    if total + incoming <= MAX_CACHE_BYTES:
        return
    for path in sorted(files, key=lambda item: item.stat().st_mtime):
        try:
            size = path.stat().st_size
            path.unlink()
            total -= size
        except OSError:
            continue
        if total + incoming <= MAX_CACHE_BYTES:
            break


def _pack_file(entry: dict, index: dict) -> Path | None:
    relative = str(entry.get("file") or "").replace("\\", "/").lstrip("/")
    if not relative or ".." in relative.split("/"):
        return None
    packs = Path(index.get("packs_dir") or settings.LISTENING_PACKS_DIR)
    path = packs / relative
    return path if path.exists() else None


def materialize_archive_asset(filename: str, kind: str) -> Path | None:
    safe = Path(filename).name
    if safe != filename or not safe:
        return None
    index = _load_index()
    entry = (index.get("assets") or {}).get(safe)
    if not entry or entry.get("kind") != kind:
        return None

    packed = _pack_file(entry, index)
    if packed:
        return packed

    cache_dir = Path(settings.LISTENING_ARCHIVE_CACHE_DIR)
    cache_dir.mkdir(parents=True, exist_ok=True)
    destination = cache_dir / safe
    if destination.exists():
        os.utime(destination, None)
        return destination

    archive = Path(index.get("archive") or settings.LISTENING_ARCHIVE_PATH)
    if not archive.exists():
        logger.error("Source listening archive no longer exists: %s", archive)
        return None
    try:
        with zipfile.ZipFile(archive) as outer:
            nested_bytes = outer.read(entry["container"])
        with zipfile.ZipFile(io.BytesIO(nested_bytes)) as nested:
            payload = nested.read(entry["member"])
    except (OSError, KeyError, zipfile.BadZipFile) as exc:
        logger.error("Cannot materialize %s: %s", safe, exc)
        return None

    _evict(cache_dir, len(payload))
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(payload)
    temporary.replace(destination)
    return destination
