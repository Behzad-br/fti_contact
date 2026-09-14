"""Socket.IO for mock telemetry only. Live screens stay on LiveKit."""
from __future__ import annotations

import logging
from datetime import datetime

logger = logging.getLogger(__name__)

try:
    import socketio
except Exception:  # pragma: no cover - optional add-on
    socketio = None  # type: ignore

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*", logger=False, engineio_logger=False) if socketio else None

WARNING_EVENTS = {
    "FULLSCREEN_EXIT",
    "TAB_HIDDEN",
    "WINDOW_BLUR",
    "SCREEN_SHARE_STOPPED",
    "DISCONNECTED",
}


def attach_socketio(fastapi_app):
    if not socketio or sio is None:
        return fastapi_app
    return socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="socket.io")


async def emit_assignment_state(assignment_id: str, payload: dict):
    if sio is None:
        return
    try:
        await sio.emit("mock:state", payload, room=f"assignment:{assignment_id}")
    except Exception as exc:
        logger.warning("Could not emit mock state: %s", exc)


if sio is not None:

    @sio.event
    async def connect(sid, environ, auth):
        return True

    @sio.event
    async def disconnect(sid):
        try:
            session = await sio.get_session(sid)
        except Exception:
            return
        assignment_id = (session or {}).get("assignment_id")
        student_id = (session or {}).get("student_id")
        if not assignment_id or (session or {}).get("role") != "student" or not student_id:
            return
        try:
            from app.database import SessionLocal
            from app.mocks.models import MockAttempt

            db = SessionLocal()
            try:
                attempt = (
                    db.query(MockAttempt)
                    .filter_by(student_id=str(student_id), assignment_id=str(assignment_id), status="in_progress")
                    .order_by(MockAttempt.started_at.desc())
                    .first()
                )
                if not attempt:
                    return
                attempt.connection_status = "disconnected"
                attempt.last_warning = "DISCONNECTED"
                db.commit()
                await emit_assignment_state(
                    str(assignment_id),
                    {
                        "assignmentId": assignment_id,
                        "eventType": "DISCONNECTED",
                        "studentId": student_id,
                        "connection": "disconnected",
                        "lastWarning": "DISCONNECTED",
                        "status": "disconnected",
                    },
                )
            finally:
                db.close()
        except Exception as exc:
            logger.warning("mock disconnect handler failed: %s", exc)

    @sio.on("join_assignment")
    async def join_assignment(sid, data):
        data = data or {}
        assignment_id = str(data.get("assignmentId") or "")
        role = str(data.get("role") or "")
        if not assignment_id or role not in {"student", "teacher"}:
            return {"ok": False}
        await sio.save_session(sid, {"assignment_id": assignment_id, "role": role, "student_id": data.get("studentId")})
        await sio.enter_room(sid, f"assignment:{assignment_id}")
        return {"ok": True}

    @sio.on("teacher:voice")
    async def teacher_voice(sid, data):
        """Broadcast live-talk banner without mutating student attempt rows."""
        data = data or {}
        try:
            session = await sio.get_session(sid)
        except Exception:
            return {"ok": False}
        if str((session or {}).get("role") or "") != "teacher":
            return {"ok": False}
        assignment_id = str(data.get("assignmentId") or (session or {}).get("assignment_id") or "")
        active = bool(data.get("active"))
        if not assignment_id:
            return {"ok": False}
        await emit_assignment_state(
            assignment_id,
            {
                "assignmentId": assignment_id,
                "eventType": "TEACHER_VOICE_ON" if active else "TEACHER_VOICE_OFF",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "studentId": data.get("studentId"),
                "attemptId": data.get("attemptId"),
            },
        )
        return {"ok": True}

    @sio.on("mock:event")
    async def mock_event(sid, data):
        data = data or {}
        attempt_id = str(data.get("attemptId") or "")
        event_type = str(data.get("eventType") or "")
        if not attempt_id or not event_type:
            return {"ok": False}
        try:
            from app.database import SessionLocal
            from app.mocks.models import MockAttempt, MockAssignment, MockAssignmentStudent

            db = SessionLocal()
            try:
                attempt = db.query(MockAttempt).filter_by(id=attempt_id).first()
                if not attempt:
                    return {"ok": False}
                session = await sio.get_session(sid)
                role = str((session or {}).get("role") or "")
                student_id = str((session or {}).get("student_id") or data.get("studentId") or "")
                # Students may only emit for their own attempt; teachers may notify (e.g. live talk).
                if role != "teacher" and student_id and attempt.student_id != student_id:
                    return {"ok": False}
                now = datetime.utcnow()
                voice_only = event_type in ("TEACHER_VOICE_ON", "TEACHER_VOICE_OFF")
                if not voice_only:
                    attempt.last_seen_at = now
                    attempt.connection_status = "stable"
                    if data.get("currentSection"):
                        attempt.current_section = data["currentSection"]
                    if data.get("currentQuestion") is not None:
                        attempt.current_question = int(data["currentQuestion"])
                    if event_type == "SCREEN_SHARE_STARTED":
                        attempt.screen_share_active = True
                    if event_type == "SCREEN_SHARE_STOPPED":
                        attempt.screen_share_active = False
                    if event_type in ("FULLSCREEN_RESTORED", "WINDOW_FOCUS", "RECONNECTED"):
                        attempt.last_warning = None
                    if event_type in WARNING_EVENTS:
                        attempt.last_warning = event_type
                    db.commit()
                assignment = db.query(MockAssignment).filter_by(id=attempt.assignment_id).first()
                slot = db.query(MockAssignmentStudent).filter_by(id=attempt.assignment_student_id).first()
                payload = {
                    "assignmentId": attempt.assignment_id,
                    "eventType": event_type,
                    "timestamp": now.isoformat() + "Z",
                    "studentId": attempt.student_id,
                    "attemptId": attempt.id,
                    "currentSection": attempt.current_section,
                    "currentQuestion": attempt.current_question,
                    "remainingSeconds": attempt.remaining_seconds,
                    "warningCount": attempt.warning_count,
                    "screenSharing": bool(attempt.screen_share_active),
                    "connection": attempt.connection_status or "stable",
                    "lastWarning": attempt.last_warning,
                    "status": attempt.status,
                    "studentName": slot.student_name if slot else attempt.student_id,
                    "slotId": slot.id if slot else None,
                    "questionTotal": attempt.question_total,
                    "paused": bool(attempt.paused),
                    "title": assignment.title if assignment else "",
                }
            finally:
                db.close()
            await emit_assignment_state(payload["assignmentId"], payload)
            return {"ok": True}
        except Exception as exc:
            logger.warning("mock:event failed: %s", exc)
            return {"ok": False}
