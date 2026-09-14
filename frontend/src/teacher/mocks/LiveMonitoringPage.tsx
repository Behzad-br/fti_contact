import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { Mic, MicOff } from 'lucide-react';
import { Button, SectionTitle, StatusBadge, Toast } from '@/components/ui-kit';
import {
  livekitToken,
  listTeacherMocks,
  mockEvents,
  mockMonitor,
  mockStudentAction,
  patchMockStudent,
  type MockAssignment,
  type MockStudentRow,
} from '@/lib/mocks-api';
import { emitTeacherVoice, joinMockAssignment } from '@/lib/mock-realtime';
import LiveVideo from '@/teacher/mocks/LiveVideo';

const WARNING_LABEL: Record<string, string> = {
  FULLSCREEN_EXIT: 'Fullscreen exited',
  TAB_HIDDEN: 'Tab changed',
  WINDOW_BLUR: 'Window focus lost',
  SCREEN_SHARE_STOPPED: 'Screen share stopped',
  DISCONNECTED: 'Disconnected',
};

function clock(seconds?: number | null) {
  if (seconds == null) return '—';
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LiveMonitoringPage({ assignmentId }: { assignmentId?: string }) {
  const [, setLocation] = useLocation();
  const [assignments, setAssignments] = useState<MockAssignment[]>([]);
  const [current, setCurrent] = useState(assignmentId || '');
  const [students, setStudents] = useState<MockStudentRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<MockStudentRow | null>(null);
  const [events, setEvents] = useState<{ event_type: string; timestamp?: string | null }[]>([]);
  const [toast, setToast] = useState('');
  const [alerts, setAlerts] = useState<{ id: string; text: string }[]>([]);
  const [tracks, setTracks] = useState<Record<string, RemoteTrack>>({});
  const [livekitOn, setLivekitOn] = useState(false);
  const [micLive, setMicLive] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    listTeacherMocks().then((d) => {
      setAssignments(d.assignments);
      if (!current && d.assignments[0]) setCurrent(d.assignments[0].id);
    }).catch(() => setAssignments([]));
  }, []);

  const load = () => {
    if (!current) return;
    mockMonitor(current).then((d) => {
      setStudents(d.students);
      setTotals(d.totals || {});
      setNote(d.screen_note || '');
      setSelected((prev) => prev ? d.students.find((s) => s.id === prev.id) || prev : prev);
    }).catch(() => setStudents([]));
  };
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [current]);

  useEffect(() => {
    if (!current) return;
    const socket = joinMockAssignment({ role: 'teacher', assignmentId: current });
    const onState = (payload: any) => {
      if (payload?.assignmentId && payload.assignmentId !== current) return;
      if (payload?.eventType && WARNING_LABEL[payload.eventType]) {
        const name = payload.studentName || payload.student_name || 'Student';
        const text = `${name}: ${WARNING_LABEL[payload.eventType]}`;
        setAlerts((prev) => (prev[0]?.text === text ? prev : [{ id: `${Date.now()}`, text }, ...prev].slice(0, 6)));
      }
      setStudents((prev) => prev.map((row) => {
        const sid = payload.student_id || payload.studentId;
        if (row.student_id !== sid && row.id !== payload.slotId) return row;
        return {
          ...row,
          current_section: payload.current_section || payload.currentSection || row.current_section,
          current_question: payload.current_question ?? payload.currentQuestion ?? row.current_question,
          remaining_seconds: payload.remaining_seconds ?? payload.remainingSeconds ?? row.remaining_seconds,
          warning_count: payload.warning_count ?? payload.warningCount ?? row.warning_count,
          screen_sharing: payload.screen_sharing ?? payload.screenSharing ?? row.screen_sharing,
          connection: payload.connection || row.connection,
          last_warning: payload.last_warning ?? payload.lastWarning ?? row.last_warning,
          status: payload.status || row.status,
        };
      }));
    };
    socket.on('mock:state', onState);
    return () => {
      socket.off('mock:state', onState);
    };
  }, [current]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setMicLive(false);
    livekitToken(current, 'teacher')
      .then(async (cred) => {
        if (!cred.enabled || !cred.token || cancelled) {
          setLivekitOn(false);
          return;
        }
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
        });
        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Video) return;
          setTracks((prev) => ({ ...prev, [participant.identity]: track as RemoteTrack }));
        });
        room.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => {
          setTracks((prev) => {
            const next = { ...prev };
            delete next[participant.identity];
            return next;
          });
        });
        room.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.kind === Track.Kind.Audio) setMicLive(true);
        });
        room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
          if (pub.kind === Track.Kind.Audio) setMicLive(false);
        });
        await room.connect(cred.url, cred.token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        roomRef.current = room;
        setLivekitOn(true);
      })
      .catch(() => setLivekitOn(false));
    return () => {
      cancelled = true;
      void roomRef.current?.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      roomRef.current?.disconnect();
      roomRef.current = null;
      setTracks({});
      setMicLive(false);
      setLivekitOn(false);
    };
  }, [current]);

  const toggleLiveTalk = async () => {
    const room = roomRef.current;
    if (!room || !livekitOn) {
      setToast('LiveKit is not connected yet. Start LiveKit and open this page again.');
      return;
    }
    setMicBusy(true);
    try {
      const next = !micLive;
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicLive(next);
      if (current) {
        emitTeacherVoice({
          assignmentId: current,
          active: next,
          studentId: selected?.student_id,
          attemptId: selected?.attempt_id,
        });
      }
      setToast(next ? 'Live talk on — students in this mock can hear you' : 'Live talk off');
    } catch {
      setToast('Microphone permission blocked. Allow mic access in the browser and try again.');
    } finally {
      setMicBusy(false);
    }
  };

  const pageSize = 20;
  const [page, setPage] = useState(0);
  const slice = students.slice(page * pageSize, page * pageSize + pageSize);
  const selectedTrack = useMemo(() => {
    if (!selected) return undefined;
    return tracks[selected.livekit_identity || `student-${selected.student_id}`];
  }, [selected, tracks]);

  return (
    <>
      <SectionTitle eyebrow="Mock exams" title="Live monitoring" description="LiveKit carries student screens and teacher live talk. Question, timer and warnings travel separately so a frozen preview still shows the real test state." />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className="h-10 rounded-lg border border-input bg-card px-3 text-sm" value={current} onChange={(e) => { setCurrent(e.target.value); setLocation(`/teacher/mocks/live/${e.target.value}`); }}>
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.title} · {a.batch_label || 'Selected'}</option>)}
        </select>
        <StatusBadge status={livekitOn ? 'Screens live' : 'Status only'} />
        {micLive && <StatusBadge status="Live talk on" />}
        <Button
          variant={micLive ? 'primary' : 'quiet'}
          disabled={micBusy || !livekitOn}
          onClick={() => void toggleLiveTalk()}
        >
          {micLive ? <Mic size={16} /> : <MicOff size={16} />}
          {micBusy ? 'Mic…' : micLive ? 'Live talk on' : 'Live talk'}
        </Button>
      </div>
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.slice(0, 3).map((alert) => (
            <div key={alert.id} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {alert.text}
            </div>
          ))}
        </div>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[['Total', totals.total], ['Active', totals.active], ['Not started', totals.not_started], ['Disconnected', totals.disconnected], ['Submitted', totals.submitted], ['Warnings', totals.warnings]].map(([label, value]) => (
          <div key={String(label)} className="card p-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-2xl font-bold">{value ?? 0}</div>
          </div>
        ))}
      </div>
      {note && <p className="mb-4 text-xs text-muted-foreground">{note}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {slice.map((s) => {
          const identity = s.livekit_identity || `student-${s.student_id}`;
          const track = tracks[identity];
          return (
            <button key={s.id} type="button" onClick={() => {
              setSelected(s);
              if (s.attempt_id) mockEvents(s.attempt_id).then((d) => setEvents(d.events || [])).catch(() => setEvents([]));
              else setEvents([]);
            }} className="card p-3 text-left hover:border-primary">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{s.student_name}</div>
                <StatusBadge status={s.status.replace('_', ' ')} />
              </div>
              <div className="mt-2 overflow-hidden rounded-lg bg-slate-900">
                {track ? <LiveVideo track={track} className="aspect-video h-auto w-full object-cover" /> : (
                  <div className="flex aspect-video items-center justify-center px-3 text-center text-xs text-white/70">
                    {s.status === 'disconnected' ? `Disconnected · last seen ${s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : '—'}` : s.screen_sharing ? 'Connecting screen…' : 'Waiting for screen share'}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.current_section || '—'} {s.current_question ? `${s.current_question}/${s.question_total || 40}` : ''} · {clock(s.remaining_seconds)} left · {s.warning_count} warnings
              </p>
              <p className="text-[11px] text-muted-foreground">
                {s.connection === 'disconnected' ? 'Disconnected' : s.connection === 'stable' ? 'Connected' : s.status} · Screen {s.screen_sharing ? 'active' : 'off'}
                {s.last_warning ? ` · ${WARNING_LABEL[s.last_warning] || s.last_warning}` : ''}
              </p>
            </button>
          );
        })}
      </div>
      {students.length > pageSize && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="quiet" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="quiet" disabled={(page + 1) * pageSize >= students.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card max-h-[92dvh] w-full max-w-4xl overflow-y-auto p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="eyebrow">Live student monitor</div>
                <h2 className="mt-1 font-display text-xl font-bold">{selected.student_name}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl bg-slate-950">
              {selectedTrack ? <LiveVideo track={selectedTrack} className="aspect-video w-full object-contain" /> : (
                <div className="flex aspect-video items-center justify-center text-sm text-white/70">No live screen yet. Status below still updates.</div>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Section {selected.current_section || '—'} · Question {selected.current_question || '—'} / {selected.question_total || '—'} · {clock(selected.remaining_seconds)} remaining · {selected.connection || selected.status} · Screen {selected.screen_sharing ? 'active' : 'off'} · Warnings {selected.warning_count}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={micLive ? 'primary' : 'quiet'}
                disabled={micBusy || !livekitOn}
                onClick={() => void toggleLiveTalk()}
              >
                {micLive ? <Mic size={16} /> : <MicOff size={16} />}
                {micBusy ? 'Mic…' : micLive ? 'Live talk on' : 'Live talk'}
              </Button>
              <Button variant="quiet" onClick={async () => { await mockStudentAction(selected.id, { action: 'message', message: 'Please stay in the mock window.' }); setToast('Message sent'); }}>Send message</Button>
              <Button variant="quiet" onClick={async () => { await patchMockStudent(selected.id, { add_minutes: 10 }); setToast('+10 minutes'); load(); }}>Add time</Button>
              <Button variant="quiet" onClick={async () => { await mockStudentAction(selected.id, { action: 'pause' }); setToast('Paused'); }}>Pause</Button>
              <Button variant="quiet" onClick={async () => { await mockStudentAction(selected.id, { action: 'resume' }); setToast('Resumed'); }}>Resume</Button>
              <Button variant="quiet" onClick={async () => { await mockStudentAction(selected.id, { action: 'flag' }); setToast('Flagged'); load(); }}>Flag</Button>
              <Button variant="danger" onClick={async () => { await mockStudentAction(selected.id, { action: 'force_submit' }); setToast('Force submitted'); load(); setSelected(null); }}>Force submit</Button>
            </div>
            {micLive && (
              <p className="mt-3 text-xs text-emerald-800">Your microphone is live to students in this mock room. Click Live talk again to mute.</p>
            )}
            {events.length > 0 && (
              <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                {events.map((event, i) => (
                  <div key={`${event.event_type}-${i}`} className="py-1">{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '—'} · {event.event_type.replaceAll('_', ' ')}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
