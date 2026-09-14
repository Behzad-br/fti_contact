# One stack: FastAPI backend + Writewise frontend
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting FastAPI backend on http://127.0.0.1:8000"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
)

Write-Host "Starting Writewise on http://localhost:5174"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\frontend'; npm run dev"
)

Write-Host ""
Write-Host "Open:  http://localhost:5174"
