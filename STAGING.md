# Cloud staging (GitHub → Vercel + Render)

Use this for **live testing**. Production VPS stays as documented in `DEPLOYMENT.md`.

## 1. Push to GitHub

```powershell
git push -u origin main
```

Repo: `https://github.com/Behzad-br/fti_contact.git`

## 2. Backend on Render

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect the GitHub repo `Behzad-br/fti_contact`
3. Confirm `render.yaml` is detected
4. Set these **secret** env vars in the Render UI (do not commit them):

| Key | Value |
| --- | --- |
| `AUTH_BOOTSTRAP_PASSWORD` | strong password for first Super Admin |
| `OPENAI_API_KEY` | optional, for AI features |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://fti-contact.vercel.app` |
| `FRONTEND_URL` | same Vercel URL |
| `DATABASE_URL` | optional MySQL URL; leave empty to use ephemeral SQLite on Render |

5. Deploy → copy the service URL, e.g. `https://fti-ielts-api.onrender.com`

Health check: `GET /api/health`

**Notes**

- Free Render spins down when idle (first request can take ~30–60s).
- Whisper uses `tiny` in `render.yaml` to fit free memory.
- SQLite on free Render is wiped on redeploy — fine for smoke tests only. For durable staging, attach a MySQL `DATABASE_URL`.

## 3. Frontend on Vercel

1. [Vercel](https://vercel.com) → **Add New Project** → import `Behzad-br/fti_contact`
2. **Root Directory:** `frontend`
3. Framework: Vite (auto)
4. Environment variable:

| Key | Value |
| --- | --- |
| `VITE_API_URL` | Render URL with **no** trailing slash, e.g. `https://fti-ielts-api.onrender.com` |

5. Deploy

`frontend/vercel.json` already rewrites SPA routes to `index.html`.

## 4. Wire CORS after both URLs exist

On Render, set:

```text
FRONTEND_URL=https://YOUR-APP.vercel.app
CORS_ORIGINS=https://YOUR-APP.vercel.app
```

Redeploy backend (or restart) so CORS picks up the Vercel origin.

## 5. First login (staging)

If `AUTH_BOOTSTRAP_PASSWORD` was set, Super Admin can sign in with:

- Username: `admin` (or `AUTH_BOOTSTRAP_USERNAME`)
- Password: the bootstrap password you set on Render
- Page: `/super-admin-login`

Then create a branch + branch admin and test that login.

## Checklist

- [ ] GitHub `main` has latest commit
- [ ] Render `/api/health` returns ok
- [ ] Vercel site loads
- [ ] Browser Network tab shows API calls to the Render host (not localhost)
- [ ] Super Admin login works
- [ ] Branch create → Branch Admin login works
