# One stack: FastAPI backend (Socket.IO) + Writewise frontend
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting FastAPI backend on http://127.0.0.1:8001"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\backend'; `$env:PYTHONPATH='.'; python -m uvicorn app.main:asgi_app --host 127.0.0.1 --port 8001"
)

Write-Host "Starting Writewise on http://localhost:5174"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Open:  http://localhost:5174"
Write-Host "API:   http://127.0.0.1:8001/api/health"
