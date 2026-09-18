# Deploy FTI IELTS LMS (ready checklist)

Repo: https://github.com/Behzad-br/fti_contact

| Piece | Free host | Notes |
| --- | --- | --- |
| Frontend | **Vercel** | Root directory = `frontend` |
| Backend | **Render** | Uses `render.yaml` + `backend/requirements.txt` |
| Database | **Neon** | Already provisioned locally against Neon if `DATABASE_URL` is set |

## Pre-flight (done in repo)

- [x] Frontend production build (`npm run build`)
- [x] Backend health + auth login smoke
- [x] Core pytest (auth/mocks/homework/notes/writing/reading/listening)
- [x] `VITE_API_URL` support for production API origin
- [x] Postgres (`psycopg2`) + SQLite local fallback
- [x] Student dashboard cleaned (real homework + mock inbox only)

## 1) Neon

Use your existing Neon project connection string:

`postgresql://…@….neon.tech/neondb?sslmode=require`

## 2) Render (API)

1. https://dashboard.render.com → New → Blueprint  
2. Connect `Behzad-br/fti_contact`  
3. Set env:
   - `DATABASE_URL` = Neon URL  
   - `OPENAI_API_KEY` = your key  
   - `CORS_ORIGINS` = your Vercel URL (add after step 3)  
   - `AUTH_BOOTSTRAP_PASSWORD` = strong password  
4. Deploy → copy API URL, e.g. `https://fti-ielts-api.onrender.com`

## 3) Vercel (UI)

1. https://vercel.com/new → Import `Behzad-br/fti_contact`  
2. **Root Directory** = `frontend`  
3. Env:
   - `VITE_API_URL` = `https://YOUR-RENDER-URL` (no trailing slash)  
4. Deploy → open the `.vercel.app` link  
5. Go back to Render and set `CORS_ORIGINS` to that Vercel URL, then redeploy API once.

## Local run

```powershell
.\start-all.ps1
```

- App: http://localhost:5174  
- API: http://127.0.0.1:8001/api/health  

Login: `admin` / your `AUTH_BOOTSTRAP_PASSWORD` (local `.env` currently uses `Admin@12345`)
