import { io, type Socket } from 'socket.io-client';
import { socketOrigin } from '@/lib/api-base';

let socket: Socket | null = null;
let lastJoin: { role: 'student' | 'teacher'; assignmentId: string; studentId?: string } | null = null;

export function mockSocket() {
  if (!socket) {
    socket = io(socketOrigin(), { path: '/socket.io', transports: ['websocket', 'polling'], autoConnect: true });
    socket.on('connect', () => {
      if (lastJoin) socket?.emit('join_assignment', lastJoin);
    });
  }
  return socket;
}

export function joinMockAssignment(opts: { role: 'student' | 'teacher'; assignmentId: string; studentId?: string }) {
  lastJoin = opts;
  const s = mockSocket();
  if (!s.connected) s.connect();
  s.emit('join_assignment', opts);
  return s;
}

export function emitMockEvent(payload: Record<string, unknown>) {
  try {
    mockSocket().emit('mock:event', payload);
  } catch {
    /* HTTP heartbeat remains the fallback */
  }
}

export function emitTeacherVoice(opts: {
  assignmentId: string;
  active: boolean;
  studentId?: string;
  attemptId?: string;
}) {
  try {
    mockSocket().emit('teacher:voice', opts);
  } catch {
    /* banner is best-effort; LiveKit audio still works */
  }
}
