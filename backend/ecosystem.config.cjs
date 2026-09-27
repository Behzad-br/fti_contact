/**
 * PM2 process file for the FastAPI + Socket.IO ASGI app.
 *
 * This is NOT a Node.js application. PM2 only supervises the Python/uvicorn process.
 * Run from this directory (backend/ or /apps/itles-backend) after creating .venv.
 *
 * Socket.IO uses in-memory rooms → keep a single fork (do not scale instances > 1
 * unless you add a Redis adapter).
 */
module.exports = {
  apps: [
    {
      name: 'itles-api',
      cwd: __dirname,
      script: '.venv/bin/python',
      args:
        '-m uvicorn app.main:asgi_app --host 127.0.0.1 --port 5000 --proxy-headers --forwarded-allow-ips 127.0.0.1',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
      max_memory_restart: '1536M',
      time: true,
      env: {
        NODE_ENV: 'production',
        ENV: 'production',
        PORT: '5000',
      },
    },
  ],
};
