"""Create / update database schema for production (MySQL) or local (SQLite).

Usage (from backend/):
    python -m app.cli.migrate
"""
from __future__ import annotations

import sys


def main() -> int:
    from app.config import settings
    from app.database import check_db, init_db

    url = settings.DATABASE_URL
    safe = url
    if "@" in url:
        # Hide password in console output
        scheme, rest = url.split("://", 1)
        if "@" in rest and ":" in rest.split("@", 1)[0]:
            userinfo, hostpart = rest.split("@", 1)
            user = userinfo.split(":", 1)[0]
            safe = f"{scheme}://{user}:***@{hostpart}"

    print(f"Migrating database: {safe}")
    if not check_db():
        print("ERROR: cannot connect to database. Check DB_* / DATABASE_URL in .env", file=sys.stderr)
        return 1

    init_db()
    print("OK: schema created / updated (additive only — no destructive migrations).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
