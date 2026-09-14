# Deploy FTI IELTS LMS

GitHub alone is code. For a live app you need three free services:

| Piece | Free host | Why |
| --- | --- | --- |
| Frontend | **Vercel** | Vite/React static hosting |
| Backend | **Render** | FastAPI + Whisper + Socket.IO (Vercel serverless cannot run this stack well) |
| Database | **Neon** | Free Postgres |

## 1. Neon (database)

1. https://console.neon.tech/signup → Continue with GitHub  
2. Create project `fti-ielts`  
3. Copy **Connection string** (`postgresql://…?sslmode=require`)

## 2. Render (backend API)

1. https://dashboard.render.com → New → Blueprint  
2. Connect `Behzad-br/fti_contact`  
3. Use `render.yaml`  
4. Set env:
   - `DATABASE_URL` = Neon string  
   - `OPENAI_API_KEY` = your key  
   - `CORS_ORIGINS` = your Vercel URL (e.g. `https://fti-contact.vercel.app`)  
   - `AUTH_BOOTSTRAP_PASSWORD` = strong password  
5. After deploy, API base looks like: `https://fti-ielts-api.onrender.com`

## 3. Vercel (frontend)

1. https://vercel.com/new → Import `Behzad-br/fti_contact`  
2. **Root Directory** = `frontend`  
3. Framework = Vite  
4. Env:
   - `VITE_API_URL` = `https://fti-ielts-api.onrender.com` (no trailing slash)  
5. Deploy  

App URL: `https://….vercel.app`

## Local still works

Leave `VITE_API_URL` unset and use Vite proxy to `127.0.0.1:8001`.
