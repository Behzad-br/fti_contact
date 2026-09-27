# Backend production notes (Python / FastAPI)
#
# This folder IS the deployable API. Node.js is NOT required to run the API.
# package.json / ecosystem.config.cjs only help with migrate/start and PM2.
#
# Production entry point:
#   app.main:asgi_app
# served by:
#   python -m uvicorn app.main:asgi_app --host 127.0.0.1 --port 5000
#
# On Ubuntu Hestia, place the contents of this folder at:
#   /home/fti4success_admin/apps/itles-backend
#
# See ../DEPLOYMENT.md for exact commands.
