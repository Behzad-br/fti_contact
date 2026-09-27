# FTI IELTS Learning Management System

```
frontend/     React + Vite SPA
backend/      FastAPI + SQLAlchemy + Socket.IO
data/         Practice banks, media, local SQLite (runtime/seed — not source code)
scripts/      Local helper scripts
DEPLOYMENT.md HestiaCP / Ubuntu production guide
```

Practice scores are estimates, not official IELTS results.

## Local development

```powershell
.\scripts\start-all.ps1
```

- App: http://localhost:5174  
- API: http://127.0.0.1:8001/api/health  

First-time setup:

```powershell
cd frontend
npm install

cd ..\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

Copy `.env.example` → `.env` at the repo root (or `backend/.env`) and set API keys. Never commit real secrets.

## Production (HestiaCP)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Ubuntu VPS paths, MySQL, PM2, and Nginx.

- Frontend: https://fti4iltes.tech  
- API: https://api.fti4iltes.tech  

## Cloud staging (Vercel + Render)

For GitHub-based live testing (not production VPS), see **[STAGING.md](./STAGING.md)**.

- Frontend → Vercel (`frontend/`)
- Backend → Render (`render.yaml`)

## Notes

- Canonical Python deps: `backend/requirements.txt`  
- Backend PM2: `backend/ecosystem.config.cjs` (supervises Uvicorn, not a Node app)  
- `backend/package.json` is script wrappers only (`migrate` / `start`)
