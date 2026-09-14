# FTI IELTS Learning Management System

One folder, one stack:

```
frontend/   Writewise UI (Vite + React)     → http://localhost:5173
backend/    FastAPI (4 skills + homework)  → http://127.0.0.1:8000
data/       SQLite, banks, audio
.env        API keys (server only)
```

Practice scores are estimates, not official IELTS results.

## Run

```powershell
.\start-all.ps1
```

Open **http://localhost:5173**

First time:

```powershell
cd frontend
npm install
cd ..\backend
pip install -r ..\requirements.txt
```
