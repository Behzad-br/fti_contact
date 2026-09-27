# Runtime / seed data (not application source)

This folder is used by the FastAPI backend for:

| Kind | Examples |
| --- | --- |
| Seed / bank JSON | `question_bank.json`, `reading-practice-bank-v3.json`, `listening-database.json`, writing bank |
| Media assets | `listening_audio/`, `listening_maps/`, `writing_images/`, `reading_diagrams/` |
| User uploads (local) | `notes/`, `homework_audio/`, `mock_images/` |
| Local DB (dev) | `ielts_speaking.db` (SQLite) — production uses MySQL on the VPS |

On the Hestia VPS, the same role is played by:

`DATA_DIR=/home/fti4success_admin/apps/itles-backend/data`

Do not put secrets here. Large packs may be gitignored; copy them to the server when deploying.
