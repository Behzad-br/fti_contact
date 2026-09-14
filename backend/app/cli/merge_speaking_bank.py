"""Merge extra original speaking tests into data/question_bank.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BANK = ROOT / "data" / "question_bank.json"
EXTRA = (
    ROOT.parent
    / "iltes writing"
    / "IELTS-Original-Practice-Data-Pack-v1"
    / "IELTS-Original-Practice-Data-Pack-v1"
    / "speaking"
    / "full-test-bank.json"
)


def convert(item: dict) -> dict:
    part1 = []
    for topic in (item.get("part_1") or {}).get("topics") or []:
        part1.extend(topic.get("questions") or [])
    cue = ((item.get("part_2") or {}).get("cue_card") or {})
    part3 = (item.get("part_3") or {}).get("questions") or []
    return {
        "id": item["id"],
        "title": item.get("title") or item["id"],
        "part1": part1[:5] or part1,
        "part2": {
            "topic": cue.get("topic") or "Describe a topic you know well.",
            "bullets": cue.get("prompts") or [],
        },
        "part3": part3[:5] or part3,
    }


def main() -> None:
    existing = json.loads(BANK.read_text(encoding="utf-8"))
    ids = {t["id"] for t in existing}
    if not EXTRA.exists():
        print(f"Extra speaking pack not found: {EXTRA}")
        return
    extra = json.loads(EXTRA.read_text(encoding="utf-8"))
    added = 0
    for item in extra.get("tests") or []:
        if item["id"] in ids:
            continue
        converted = convert(item)
        if len(converted["part1"]) < 3 or not converted["part2"]["topic"]:
            continue
        existing.append(converted)
        ids.add(item["id"])
        added += 1
    BANK.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Speaking bank now has {len(existing)} tests ({added} added).")


if __name__ == "__main__":
    main()
