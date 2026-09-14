import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { LocalVideoTrack, Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { Button } from '@/components/ui-kit';
import WritingRoom from '@/practice/WritingRoom';
import ReadingRoom from '@/practice/ReadingRoom';
import ListeningRoom from '@/practice/ListeningRoom';
import SpeakingRoom from '@/practice/SpeakingRoom';
import { getCurrentStudent } from '@/lib/mock-api';
import { livekitToken, mockHeartbeat, saveMockAnswers, startMockAttempt, submitMockAttempt } from '@/lib/mocks-api';
import { emitMockEvent, joinMockAssignment, mockSocket } from '@/lib/mock-realtime';

function assignmentFromUrl() {
  const search = new URLSearchParams(window.location.search);
  return search.get('assignment') || sessionStorage.getItem('mock-assignment-id') || '';
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function snapshotAnswers() {
  const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input[type="radio"]:checked, input[type="checkbox"]:checked'));
  return fields.slice(0, 80).map((el, i) => ({
    question_key: el.getAttribute('name') || el.id || `field-${i}`,
    value: el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value,
  })).filter((row) => String(row.value ?? '').length > 0);
}

export default function MockRoom({ attemptId }: { attemptId: string }) {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');
  const [shareBlocked, setShareBlocked] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(true);
  const [warning, setWarning] = useState('');
  const [teacherTalking, setTeacherTalking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef<Promise<Room | null> | null>(null);
  const teacherAudioRef = useRef<HTMLAudioElement | null>(null);
  const attemptRef = useRef(attemptId);
  const finishingRef = useRef(false);
  const sessionRef = useRef<any>(null);
  const assignmentId = assignmentFromUrl();

  const attachTeacherAudio = (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    let el = teacherAudioRef.current;
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      teacherAudioRef.current = el;
    }
    track.attach(el);
    void el.play().then(() => {
      setAudioBlocked(false);
      setTeacherTalking(true);
    }).catch(() => {
      setAudioBlocked(true);
      setTeacherTalking(true);
    });
  };

  const unlockTeacherAudio = () => {
    const el = teacherAudioRef.current;
    if (!el) {
      setAudioBlocked(false);
      return;
    }
    void el.play().then(() => {
      setAudioBlocked(false);
      setTeacherTalking(true);
    }).catch(() => setAudioBlocked(true));
  };

  const ping = (eventType: string, extra: Record<string, unknown> = {}) => {
    const id = attemptRef.current;
    const payload = {
      attemptId: id,
      studentId: getCurrentStudent().id,
      eventType,
      timestamp: new Date().toISOString(),
      currentSection: sessionRef.current?.current_section,
      ...extra,
    };
    emitMockEvent(payload);
    void mockHeartbeat(id, { event_type: eventType, current_section: sessionRef.current?.current_section, ...extra }).catch(() => undefined);
  };

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (assignmentId) sessionStorage.setItem('mock-assignment-id', assignmentId);
    if (!assignmentId) {
      setError('Missing assignment. Open this mock from your inbox.');
      return;
    }
    startMockAttempt(assignmentId, true)
      .then((row) => {
        attemptRef.current = row.attempt_id || attemptId;
        sessionRef.current = row;
        setSession(row);
        setRemaining(row.remaining_seconds ?? null);
        joinMockAssignment({ role: 'student', assignmentId: row.assignment_id || assignmentId, studentId: getCurrentStudent().id });
      })
      .catch((e) => setError(e.message));
  }, [assignmentId, attemptId]);

  useEffect(() => {
    if (remaining == null) return;
    const tick = setInterval(() => {
      if (paused) return;
      setRemaining((value) => {
        if (value == null) return value;
        return Math.max(0, value - 1);
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [session, paused]);

  useEffect(() => {
    if (remaining !== 0 || !session?.auto_submit || finishingRef.current) return;
    finishingRef.current = true;
    void (async () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      ping('TEST_SUBMITTED');
      await submitMockAttempt(attemptRef.current).catch(() => undefined);
      roomRef.current?.disconnect();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      setLocation('/student/mocks/completed');
    })();
  }, [remaining, session, setLocation]);

  const ensureLivekitRoom = async (): Promise<Room | null> => {
    if (roomRef.current) return roomRef.current;
    if (connectingRef.current) return connectingRef.current;
    const assignment = sessionRef.current?.assignment_id || assignmentId;
    if (!assignment) return null;
    connectingRef.current = (async () => {
      try {
        const cred = await livekitToken(assignment, 'student');
        if (!cred.enabled || !cred.token) return null;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) attachTeacherAudio(track as RemoteTrack);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          track.detach();
          setTeacherTalking(false);
          setAudioBlocked(false);
        });
        await room.connect(cred.url, cred.token);
        room.remoteParticipants.forEach((participant) => {
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.track) attachTeacherAudio(pub.track as RemoteTrack);
          });
        });
        roomRef.current = room;
        return room;
      } catch {
        return null;
      } finally {
        connectingRef.current = null;
      }
    })();
    return connectingRef.current;
  };

  const publishShare = async (stream: MediaStream) => {
    streamRef.current = stream;
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      setShareBlocked(true);
      ping('SCREEN_SHARE_STOPPED');
    });
    ping('SCREEN_SHARE_STARTED');
    setShareBlocked(false);
    try {
      const room = await ensureLivekitRoom();
      if (!room) return;
      const mediaTrack = stream.getVideoTracks()[0];
      if (!mediaTrack) return;
      const videoTrack = new LocalVideoTrack(mediaTrack, undefined, false);
      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        simulcast: true,
        videoEncoding: { maxBitrate: 280_000, maxFramerate: 8 },
      });
    } catch {
      /* LiveKit down: local share + telemetry still work */
    }
  };

  const startShare = async () => {
    if (!sessionRef.current?.screen_monitoring) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 8, height: 360 },
        audio: false,
      } as DisplayMediaStreamOptions);
      await publishShare(stream);
    } catch {
      setShareBlocked(true);
    }
  };

  useEffect(() => {
    if (!session) return;
    const id = attemptRef.current;
    const supervised = Boolean(session.screen_monitoring || session.fullscreen_required || session.secure_mode);
    const onLeave = (e: BeforeUnloadEvent) => {
      ping('DISCONNECTED');
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', () => ping('DISCONNECTED'));
    const onContext = (e: MouseEvent) => { if (supervised) e.preventDefault(); };
    const onCopy = (e: ClipboardEvent) => { if (supervised) e.preventDefault(); };
    const onCut = (e: ClipboardEvent) => { if (supervised) e.preventDefault(); };
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onCopy);
    const onVis = () => {
      ping(document.hidden ? 'TAB_HIDDEN' : 'WINDOW_FOCUS');
      if (document.hidden) setWarning('You left the mock test window. Please return to the test.');
    };
    document.addEventListener('visibilitychange', onVis);
    const onBlur = () => {
      ping('WINDOW_BLUR');
      setWarning('You left the mock test window. Please return to the test.');
    };
    const onFocus = () => ping('WINDOW_FOCUS');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    const onFs = () => {
      ping(document.fullscreenElement ? 'FULLSCREEN_RESTORED' : 'FULLSCREEN_EXIT');
      if (!document.fullscreenElement) setWarning('You left the mock test window. Please return to the test.');
    };
    document.addEventListener('fullscreenchange', onFs);
    const beat = setInterval(async () => {
      try {
        const answers = snapshotAnswers();
        if (answers.length) {
          await saveMockAnswers(id, { answers, client_seq: Date.now(), current_section: sessionRef.current?.current_section });
        }
        const pulse = await mockHeartbeat(id, { event_type: 'HEARTBEAT' });
        emitMockEvent({ attemptId: id, studentId: getCurrentStudent().id, eventType: 'HEARTBEAT' });
        setConnected(true);
        setPaused(Boolean(pulse.paused));
        if (typeof pulse.remaining_seconds === 'number') setRemaining(pulse.remaining_seconds);
        if (pulse.status === 'submitted') setLocation('/student/mocks/completed');
      } catch {
        setConnected(false);
        ping('DISCONNECTED');
      }
    }, 8000);
    if (session.fullscreen_required && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => setWarning('Fullscreen is required for this mock.'));
    }
    const socket = mockSocket();
    const onState = (payload: any) => {
      const type = payload?.eventType || payload?.event_type;
      if (type === 'TEACHER_VOICE_ON') setTeacherTalking(true);
      if (type === 'TEACHER_VOICE_OFF') setTeacherTalking(false);
    };
    socket.on('mock:state', onState);
    if (session.screen_monitoring) void ensureLivekitRoom();
    void startShare();
    return () => {
      socket.off('mock:state', onState);
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onCopy);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFs);
      clearInterval(beat);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      teacherAudioRef.current?.pause();
      teacherAudioRef.current = null;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [session, setLocation]);

  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    ping('TEST_SUBMITTED');
    await submitMockAttempt(attemptRef.current).catch(() => undefined);
    roomRef.current?.disconnect();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setLocation('/student/mocks/completed');
  };

  if (error) return <div className="p-6 text-sm text-red-700">{error}</div>;
  if (!session) return <div className="p-6 text-sm text-muted-foreground">Opening mock room…</div>;

  const skill = session.skill || {};
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-slate-950 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{session.title || 'Mock exam'}</div>
          <div className="text-[11px] text-white/60">{session.current_section || skill.kind || 'In progress'}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={connected ? 'text-emerald-300' : 'text-amber-300'}>{connected ? 'Connected' : 'Reconnecting…'}</span>
          <span className="font-mono text-sm">{remaining == null ? '—' : clock(remaining)}{paused ? ' paused' : ''}</span>
          <Button variant="quiet" onClick={finish}>Submit mock</Button>
        </div>
      </div>
      {teacherTalking && (
        <div className="bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
          Teacher is speaking to you live — listen carefully.
          {audioBlocked && (
            <button type="button" className="ml-3 underline" onClick={unlockTeacherAudio}>
              Tap to hear teacher
            </button>
          )}
        </div>
      )}
      {audioBlocked && !teacherTalking && (
        <div className="bg-sky-50 px-4 py-2 text-sm text-sky-950">
          Browser blocked autoplay.
          <button type="button" className="ml-3 font-semibold underline" onClick={unlockTeacherAudio}>
            Enable teacher audio
          </button>
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 px-4 py-2 text-sm text-amber-950">
          {warning}
          <button type="button" className="ml-3 font-bold" onClick={() => setWarning('')}>Dismiss</button>
        </div>
      )}
      {shareBlocked && session.screen_monitoring && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <div className="card max-w-md p-6 text-center">
            <h2 className="font-display text-xl font-bold">Screen sharing required</h2>
            <p className="mt-2 text-sm text-muted-foreground">This supervised mock requires active screen monitoring. Capture starts only after you grant permission.</p>
            <Button className="mt-4" onClick={() => void startShare()}>Resume screen sharing</Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {skill.kind === 'writing-question' && <WritingRoom questionId={skill.questionId} onDone={finish} />}
        {skill.kind === 'writing-mock' && <WritingRoom mockId={skill.mockId} onDone={finish} />}
        {skill.kind === 'reading' && <ReadingRoom attemptId={skill.attemptId} onExit={finish} onSubmitted={finish} />}
        {skill.kind === 'listening' && <ListeningRoom attemptId={skill.attemptId} onExit={finish} />}
        {skill.kind === 'speaking' && <SpeakingRoom sessionId={skill.sessionId} onExit={finish} />}
      </div>
    </div>
  );
}
