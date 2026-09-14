export type Role = 'student' | 'teacher' | 'admin' | 'branch-admin';
export type AssignmentStatus = 'Pending' | 'In progress' | 'Completed';

export type Assignment = {
  id: string; title: string; task: 'Task 1' | 'Task 2'; type: 'Academic' | 'General Training';
  status: AssignmentStatus; due: string; dueLabel: string; teacher: string; batch: string;
  question: string; words: number; duration: number; submitted?: string;
};
export type Student = { id: string; name: string; initials: string; email: string; band: number; trend: string; status: string; lastActive: string; batch: string; username?: string };
export type WritingSession = { attemptId: string; startedAt: number; expiresAt: number; serverTime: number; durationMinutes: number };
export type ReviewDraft = {
  attemptId: string;
  criteria: Record<string, string>;
  overall: string;
  feedback: string;
  strengths: string;
  areas: string;
  corrections: { original: string; corrected: string; category: string; explanation: string }[];
  status: 'Draft' | 'Published';
};

export const student = { name: '', initials: '', email: '', track: 'Academic', batch: '' };
export const assignments: Assignment[] = [];
export const students: Student[] = [];
export const trendData: { month: string; band: number }[] = [];
export const adminTrend: { month: string; attempts: number; band: number }[] = [];

export type StudentWorkItem = { id: string; title: string; skill: string; status: 'Pending' | 'In progress' | 'Completed'; due: string; teacher: string };

export type StudentWorkReport = {
  assigned: number;
  completed: number;
  inProgress: number;
  pending: number;
  completionPct: number;
  practiceSessions: number;
  skills: { skill: string; assigned: number; completed: number }[];
  items: StudentWorkItem[];
};

function skillFromAssignment(a: Assignment): string {
  if (a.task === 'Task 1' || a.task === 'Task 2') return 'Writing';
  return 'Writing';
}

export function homeworkAliasesForStudent(s: { id: string; email?: string; username?: string }) {
  const ids = [s.id, s.username, (s.email || "").split("@")[0]].filter(Boolean) as string[];
  const key = `${s.id} ${s.username || ""} ${s.email || ""}`.toLowerCase();
  if (s.id === "s1" || key.includes("ali.ahmad") || key.includes("local")) ids.push("local");
  return [...new Set(ids.map((id) => String(id)))];
}

export function studentWorkReport(studentId: string, batch: string): StudentWorkReport {
  const fromBatch = assignments.filter((a) => a.batch === batch).map((a) => ({
    id: `${studentId}-${a.id}`,
    title: a.title,
    skill: skillFromAssignment(a),
    status: a.status,
    due: a.dueLabel,
    teacher: a.teacher,
  }));
  const seed: StudentWorkItem[] = [
    { id: `${studentId}-w1`, title: 'Opinion essay · Community', skill: 'Writing', status: 'Completed', due: 'Submitted 2 days ago', teacher: 'Nadia Rahman' },
    { id: `${studentId}-r1`, title: 'Reading · Matching headings', skill: 'Reading', status: 'Completed', due: 'Reviewed last week', teacher: 'Nadia Rahman' },
    { id: `${studentId}-l1`, title: 'Listening Part 2 · Campus tour', skill: 'Listening', status: 'In progress', due: 'Due in 4 days', teacher: 'Kamran Ali' },
    { id: `${studentId}-s1`, title: 'Speaking Part 3 · Cities', skill: 'Speaking', status: 'Pending', due: 'Due in 7 days', teacher: 'Hina Saeed' },
  ];
  const items = fromBatch.length ? fromBatch : seed;
  const assigned = items.length;
  const completed = items.filter((i) => i.status === 'Completed').length;
  const inProgress = items.filter((i) => i.status === 'In progress').length;
  const pending = items.filter((i) => i.status === 'Pending').length;
  const bySkill = ['Writing', 'Reading', 'Listening', 'Speaking'].map((skill) => {
    const rows = items.filter((i) => i.skill === skill);
    const extraAssigned = rows.length ? rows.length : (skill === 'Writing' ? assigned : studentId.charCodeAt(1) % 3);
    const extraDone = rows.length ? rows.filter((i) => i.status === 'Completed').length : Math.max(0, extraAssigned - 1);
    return { skill, assigned: extraAssigned, completed: extraDone };
  });
  return {
    assigned,
    completed,
    inProgress,
    pending,
    completionPct: assigned ? Math.round((completed / assigned) * 100) : 0,
    practiceSessions: 8 + (studentId.charCodeAt(studentId.length - 1) % 12),
    skills: bySkill,
    items,
  };
}
export const reviewEssay = `In my opinion, making public transport free could be an effective way to reduce traffic congestion, although it would need to be introduced carefully.\n\nThe most immediate advantage would be encouraging people to leave their cars at home. Many commuters currently choose private vehicles because they are convenient, but a free and reliable train or bus service would remove one important reason to drive. This could reduce the number of vehicles on the roads during peak hours.\n\nHowever, free transport alone cannot solve congestion. Services would need more routes and better frequency, particularly in growing suburbs. The cost would also be significant for governments, and poorly maintained services might discourage passengers despite being free.\n\nOverall, I agree that free public transport could contribute to less traffic, but it should form part of a wider investment in reliable, well-connected infrastructure.`;

export function getPublishedReview() { return localStorage.getItem('ielts-published-review') === 'true'; }
export function setPublishedReview(value: boolean) { localStorage.setItem('ielts-published-review', String(value)); }
export function getDraft() { return localStorage.getItem('ielts-writing-draft') || ''; }
export function saveDraft(value: string) { localStorage.setItem('ielts-writing-draft', value); }
export function getRole(): Role { return (localStorage.getItem('ielts-role') as Role) || 'student'; }
export function setRole(role: Role) { localStorage.setItem('ielts-role', role); }

const mockStore = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
};

export function startWritingSession(attemptId: string, durationMinutes: number): WritingSession {
  const serverTime = Date.now();
  const session = { attemptId, startedAt: serverTime, expiresAt: serverTime + durationMinutes * 60_000, serverTime, durationMinutes };
  localStorage.setItem(`ielts-session-${attemptId}`, JSON.stringify(session));
  return session;
}

export function getWritingSession(attemptId: string, durationMinutes: number): WritingSession {
  return mockStore<WritingSession>(`ielts-session-${attemptId}`, startWritingSession(attemptId, durationMinutes));
}

export function saveWritingDraft(attemptId: string, value: string): { savedAt: number } {
  localStorage.setItem(`ielts-draft-${attemptId}`, value);
  return { savedAt: Date.now() };
}

export function getWritingDraft(attemptId: string): string {
  return localStorage.getItem(`ielts-draft-${attemptId}`) || getDraft();
}

export function submitHomework(attemptId: string, value: string): { attemptId: string; status: 'Awaiting Teacher Review'; wordCount: number } {
  const result = { attemptId, status: 'Awaiting Teacher Review' as const, wordCount: value.trim() ? value.trim().split(/\s+/).length : 0 };
  localStorage.setItem(`ielts-homework-submission-${attemptId}`, JSON.stringify(result));
  return result;
}

export function submitPractice(attemptId: string, value: string): { attemptId: string; status: 'Analysing'; wordCount: number } {
  const result = { attemptId, status: 'Analysing' as const, wordCount: value.trim() ? value.trim().split(/\s+/).length : 0 };
  localStorage.setItem(`ielts-practice-submission-${attemptId}`, JSON.stringify(result));
  return result;
}

export function getReviewDraft(attemptId: string): ReviewDraft {
  return mockStore<ReviewDraft>(`ielts-review-${attemptId}`, {
    attemptId,
    criteria: { 'Task response': '7.0', 'Coherence & cohesion': '6.5', 'Lexical resource': '6.0', 'Grammatical range & accuracy': '6.5' },
    overall: '6.5',
    feedback: 'Clear position and a logical structure. Make supporting examples more specific to move towards band 7.',
    strengths: 'A clear position, balanced paragraphs, and a confident conclusion.',
    areas: 'Develop examples further and check article use in longer sentences.',
    corrections: [{ original: 'free and reliable train or bus service', corrected: 'a free, reliable train or bus service', category: 'Grammar', explanation: 'Use a comma between coordinate adjectives.' }],
    status: getPublishedReview() ? 'Published' : 'Draft',
  });
}

export function saveReviewDraft(review: ReviewDraft): ReviewDraft {
  localStorage.setItem(`ielts-review-${review.attemptId}`, JSON.stringify(review));
  return review;
}

export function publishReview(review: ReviewDraft): ReviewDraft {
  const published = { ...review, status: 'Published' as const };
  saveReviewDraft(published);
  setPublishedReview(true);
  return published;
}

export function listMockEntities(kind: string): Record<string, string>[] {
  return mockStore<Record<string, string>[]>(`ielts-entities-${kind}`, []);
}

function deletedTeacherKeys(): Set<string> {
  return new Set(mockStore<string[]>('ielts-deleted-teachers', []));
}

function deletedStudentKeys(): Set<string> {
  return new Set(mockStore<string[]>('ielts-deleted-students', []));
}

export function saveMockEntity(kind: string, value: Record<string, string>): Record<string, string> {
  const key = `ielts-entities-${kind}`;
  const rows = mockStore<Record<string, string>[]>(key, []);
  const saved = { ...value, id: value.id || `${kind}-${Date.now()}` };
  localStorage.setItem(key, JSON.stringify([saved, ...rows]));
  if (kind === 'teacher') {
    const deleted = deletedTeacherKeys();
    deleted.delete(saved.id);
    if (saved.email) deleted.delete(saved.email.toLowerCase());
    localStorage.setItem('ielts-deleted-teachers', JSON.stringify([...deleted]));
  }
  if (kind === 'student') {
    const deleted = deletedStudentKeys();
    deleted.delete(saved.id);
    if (saved.email) deleted.delete(saved.email.toLowerCase());
    localStorage.setItem('ielts-deleted-students', JSON.stringify([...deleted]));
  }
  if (kind === 'teacher' || kind === 'student') {
    void (async () => {
      try {
        const { orgFetch, getAccessToken } = await import('@/lib/auth-api');
        if (!getAccessToken()) return;
        const created = await orgFetch<{ id: string }>('/org/users', {
          method: 'POST',
          body: JSON.stringify({
            role: kind === 'teacher' ? 'teacher' : 'student',
            email: saved.email,
            username: saved.username || (saved.email || '').split('@')[0],
            password: saved.password || 'ChangeMe123!',
            full_name: saved.fullName || saved.name || '',
            branch_id: saved.branchId || '',
            batch: saved.batch || '',
            batches: saved.batches || '',
          }),
        });
        if (created?.id && created.id !== saved.id) {
          const next = listMockEntities(kind).map((row) => (row.id === saved.id ? { ...row, id: created.id } : row));
          localStorage.setItem(key, JSON.stringify(next));
        }
      } catch {
        /* local row remains; retry after login */
      }
    })();
  }
  return saved;
}

const seededTeachers: Record<string, string>[] = [];

export function listTeacherAccounts(): Record<string, string>[] {
  const deleted = deletedTeacherKeys();
  const created = listMockEntities('teacher').filter((t) =>
    !deleted.has(t.id) && !deleted.has((t.email || '').toLowerCase())
  );
  return created;
}

export function getTeacherAccount(id: string): Record<string, string> | undefined {
  return listTeacherAccounts().find((t) => t.id === id);
}

const TEACHER_SESSION_KEY = 'ielts-current-teacher-id';
const TEACHER_CHANGED_EVENT = 'ielts-teacher-changed';

function notifyTeacherSession() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TEACHER_CHANGED_EVENT));
}

export function subscribeTeacherSession(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TEACHER_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(TEACHER_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function setCurrentTeacher(id: string) {
  localStorage.setItem(TEACHER_SESSION_KEY, id);
  notifyTeacherSession();
}

export function getCurrentTeacher(): Record<string, string> {
  const id = typeof window === 'undefined' ? '' : (localStorage.getItem(TEACHER_SESSION_KEY) || '');
  const accounts = listTeacherAccounts();
  return (
    accounts.find((t) => t.id === id) ||
    accounts[0] ||
    { id: '', fullName: '', name: '', email: '', username: '', password: '', batches: '', branchId: '', branchName: '' }
  );
}

export function updateCurrentTeacherAccount(patch: { fullName?: string; password?: string }): Record<string, string> | null {
  const current = getCurrentTeacher();
  if (!current?.id) return null;
  const nextName = (patch.fullName ?? current.fullName ?? current.name ?? '').trim();
  if (nextName.length < 2) return null;
  const nextPatch: Record<string, string> = { fullName: nextName, name: nextName };
  if (patch.password) nextPatch.password = patch.password;
  const saved = updateTeacherAccount(current.id, nextPatch);
  if (saved) setCurrentTeacher(saved.id);
  return saved;
}

export type SuperAdminAccount = {
  fullName: string;
  name: string;
  username: string;
  password: string;
};

export type LmsPreferences = {
  academyName: string;
  targetBand: string;
};

const SUPER_ADMIN_KEY = 'ielts-super-admin';
const SUPER_ADMIN_CHANGED_EVENT = 'ielts-super-admin-changed';
const LMS_PREFS_KEY = 'ielts-lms-preferences';

const defaultSuperAdmin: SuperAdminAccount = {
  fullName: 'Super Admin',
  name: 'Super Admin',
  username: 'admin',
  password: '',
};

const defaultLmsPreferences: LmsPreferences = {
  academyName: 'FTI IELTS Learning Management System',
  targetBand: '7.0',
};

function notifySuperAdminSession() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SUPER_ADMIN_CHANGED_EVENT));
}

export function subscribeSuperAdminSession(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SUPER_ADMIN_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(SUPER_ADMIN_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function getCurrentSuperAdmin(): SuperAdminAccount {
  const stored = mockStore<Partial<SuperAdminAccount> | null>(SUPER_ADMIN_KEY, null);
  if (!stored) return { ...defaultSuperAdmin };
  const fullName = (stored.fullName || stored.name || defaultSuperAdmin.fullName).trim() || defaultSuperAdmin.fullName;
  return {
    fullName,
    name: (stored.name || fullName).trim() || fullName,
    username: (stored.username || defaultSuperAdmin.username).trim() || defaultSuperAdmin.username,
    password: stored.password || defaultSuperAdmin.password,
  };
}

export function matchSuperAdminLogin(username: string, password: string): SuperAdminAccount | null {
  const account = getCurrentSuperAdmin();
  if (username.trim().toLowerCase() !== account.username.toLowerCase()) return null;
  if (account.password !== password) return null;
  return account;
}

export function updateCurrentSuperAdminAccount(patch: { fullName?: string; password?: string }): SuperAdminAccount | null {
  const current = getCurrentSuperAdmin();
  const nextName = (patch.fullName ?? current.fullName ?? current.name ?? '').trim();
  if (nextName.length < 2) return null;
  const next: SuperAdminAccount = {
    ...current,
    fullName: nextName,
    name: nextName,
    password: patch.password || current.password,
  };
  localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(next));
  notifySuperAdminSession();
  return next;
}

export function getLmsPreferences(): LmsPreferences {
  const stored = mockStore<Partial<LmsPreferences> | null>(LMS_PREFS_KEY, null);
  if (!stored) return { ...defaultLmsPreferences };
  return {
    academyName: stored.academyName?.trim() || defaultLmsPreferences.academyName,
    targetBand: stored.targetBand || defaultLmsPreferences.targetBand,
  };
}

export function saveLmsPreferences(patch: Partial<LmsPreferences>): LmsPreferences | null {
  const current = getLmsPreferences();
  const academyName = (patch.academyName ?? current.academyName).trim();
  const targetBand = (patch.targetBand ?? current.targetBand).trim();
  if (academyName.length < 2) return null;
  const next: LmsPreferences = { academyName, targetBand };
  localStorage.setItem(LMS_PREFS_KEY, JSON.stringify(next));
  return next;
}

export function updateTeacherAccount(id: string, patch: Record<string, string>): Record<string, string> | null {
  const current = listTeacherAccounts().find((t) => t.id === id);
  if (!current) return null;
  const next = { ...current, ...patch, id };
  const key = 'ielts-entities-teacher';
  const created = listMockEntities('teacher');
  const index = created.findIndex((t) => t.id === id || (t.email && current.email && t.email.toLowerCase() === current.email.toLowerCase()));
  const rows = index >= 0 ? created.map((t, i) => (i === index ? next : t)) : [next, ...created];
  localStorage.setItem(key, JSON.stringify(rows));
  if (typeof window !== 'undefined' && localStorage.getItem(TEACHER_SESSION_KEY) === id) {
    notifyTeacherSession();
  }
  return next;
}

export function removeTeacherAccount(id: string): boolean {
  const current = getTeacherAccount(id);
  if (!current) return false;
  setTeacherBatchAssignments(id, []);
  const created = listMockEntities('teacher').filter((t) =>
    t.id !== id && (t.email || '').toLowerCase() !== (current.email || '').toLowerCase()
  );
  localStorage.setItem('ielts-entities-teacher', JSON.stringify(created));
  const deleted = deletedTeacherKeys();
  deleted.add(id);
  if (current.email) deleted.add(current.email.toLowerCase());
  localStorage.setItem('ielts-deleted-teachers', JSON.stringify([...deleted]));
  return true;
}

export function isStudentRemoved(id: string, email?: string): boolean {
  const deleted = deletedStudentKeys();
  return deleted.has(id) || Boolean(email && deleted.has(email.toLowerCase()));
}

export function removeStudentAccount(id: string, email?: string): boolean {
  const created = listMockEntities('student');
  const current = created.find((s) => s.id === id || (email && (s.email || '').toLowerCase() === email.toLowerCase()));
  const mail = (current?.email || email || '').toLowerCase();
  localStorage.setItem(
    'ielts-entities-student',
    JSON.stringify(created.filter((s) => s.id !== id && (s.email || '').toLowerCase() !== mail))
  );
  const deleted = deletedStudentKeys();
  deleted.add(id);
  if (mail) deleted.add(mail);
  localStorage.setItem('ielts-deleted-students', JSON.stringify([...deleted]));
  return true;
}

const seededStudentAccounts: Record<string, string>[] = [];

export function listStudentAccounts(): Record<string, string>[] {
  const deleted = deletedStudentKeys();
  const created = listMockEntities('student').filter((s) =>
    !deleted.has(s.id) && !deleted.has((s.email || '').toLowerCase())
  );
  return created.map((s) => ({
    ...s,
    password: s.password || '',
    username: s.username || (s.email || '').split('@')[0],
  }));
}

export function getStudentAccount(id: string): Record<string, string> | undefined {
  return listStudentAccounts().find((s) => s.id === id);
}

function rosterInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'ST';
}

export function listTeacherRoster(): Student[] {
  return listMockEntities('student')
    .filter((s) => !isStudentRemoved(s.id, s.email))
    .map((s) => {
      const name = s.fullName || s.name || 'Student';
      return {
        id: s.id,
        name,
        initials: rosterInitials(name),
        email: s.email || '',
        username: s.username || s.studentId || (s.email || '').split('@')[0],
        band: Number(s.band) || 0,
        trend: s.trend || '—',
        status: s.status || 'New',
        lastActive: s.lastActive || 'Just added',
        batch: s.batch || 'Unassigned',
      };
    });
}

export function updateStudentAccount(id: string, patch: Record<string, string>): Record<string, string> | null {
  const current = listStudentAccounts().find((s) => s.id === id);
  if (!current) return null;
  const seed = students.find((s) => s.id === id);
  const next = {
    ...current,
    trend: current.trend || seed?.trend || '—',
    band: current.band || (seed ? String(seed.band) : ''),
    status: current.status || seed?.status || 'Active',
    lastActive: current.lastActive || seed?.lastActive || 'Just updated',
    ...patch,
    id,
  };
  const created = listMockEntities('student');
  const index = created.findIndex((s) => s.id === id || (s.email && current.email && s.email.toLowerCase() === current.email.toLowerCase()));
  const rows = index >= 0 ? created.map((s, i) => (i === index ? next : s)) : [next, ...created];
  localStorage.setItem('ielts-entities-student', JSON.stringify(rows));
  return next;
}

export function matchStudentLogin(emailOrUsername: string, password: string): Record<string, string> | null {
  const key = emailOrUsername.trim().toLowerCase();
  const row = listStudentAccounts().find((s) =>
    (s.email || '').toLowerCase() === key ||
    (s.username || '').toLowerCase() === key ||
    (s.studentId || '').toLowerCase() === key
  );
  if (!row || row.password !== password) return null;
  return row;
}

export type CurrentStudent = { id: string; name: string; batch: string; email: string; username?: string };

export function setCurrentStudent(row: Partial<CurrentStudent> & { id: string }) {
  const next: CurrentStudent = {
    id: row.id,
    name: row.name || 'Student',
    batch: row.batch || '',
    email: row.email || '',
    username: row.username || '',
  };
  localStorage.setItem('ielts-current-student', JSON.stringify(next));
  localStorage.setItem('writing_student_id', row.id === 's1' ? 'local' : row.id);
}

export function getCurrentStudent(): CurrentStudent {
  try {
    const row = JSON.parse(localStorage.getItem('ielts-current-student') || '') as CurrentStudent;
    if (row?.id) return row;
  } catch {
    /* ignore */
  }
  return { id: '', name: '', batch: '', email: '', username: '' };
}

export type CampusBatch = {
  id: string;
  name: string;
  schedule: string;
  teacher: string;
  teacherId: string;
  subjects: string;
  students: number;
  avg: string;
  branchId: string;
};

function defaultBatchSubjects(teacherName: string): string {
  const n = teacherName.toLowerCase();
  if (n.includes('nadia')) return 'Writing · Speaking';
  if (n.includes('hina')) return 'Reading · Listening';
  if (n.includes('kamran')) return 'Writing · Reading';
  return 'Writing · Reading · Listening · Speaking';
}

const seededBatches: Record<string, string>[] = [];

function toCampusBatch(b: Record<string, string>): CampusBatch {
  const teacher = b.teacherName || b.teacher || '';
  return {
    id: b.id,
    name: b.name || b.id,
    schedule: b.schedule || '',
    teacher,
    teacherId: b.teacherId || '',
    subjects: b.subjects || defaultBatchSubjects(teacher),
    students: Number(b.students) || 0,
    avg: b.avg || '—',
    branchId: b.branchId || '',
  };
}

export function listCampusBatches(branchId?: string): CampusBatch[] {
  const created = listMockEntities('batch');
  return created.map(toCampusBatch).filter((b) => !branchId || b.branchId === branchId);
}

function teacherBatchNames(teacher: Record<string, string>): string[] {
  return (teacher.batches || '').split(',').map((n) => n.trim()).filter((n) => n && n !== '—');
}

export function assignedBatchIdsForTeacher(teacherId: string): string[] {
  const teacher = getTeacherAccount(teacherId);
  if (!teacher) return [];
  const named = new Set(teacherBatchNames(teacher));
  return listCampusBatches(teacher.branchId).filter((b) =>
    b.teacherId === teacher.id || named.has(b.name)
  ).map((b) => b.id);
}

export function setTeacherBatchAssignments(teacherId: string, selectedIds: string[]): CampusBatch[] {
  const teacher = getTeacherAccount(teacherId);
  if (!teacher) return [];
  const teacherName = teacher.fullName || teacher.name || '';
  const campusId = teacher.branchId;
  const selected = new Set(selectedIds);
  const created = listMockEntities('batch');
  const rows = created.map((b) => {
    const onCampus = b.branchId === campusId;
    if (!onCampus) return b;
    if (selected.has(b.id)) {
      return { ...b, teacherId, teacherName, teacher: teacherName };
    }
    if (b.teacherId === teacherId) {
      return { ...b, teacherId: '', teacherName: '', teacher: '' };
    }
    return b;
  });
  localStorage.setItem('ielts-entities-batch', JSON.stringify(rows));

  const campus = listCampusBatches(campusId);
  const assignedNames = campus.filter((b) => selected.has(b.id)).map((b) => b.name);
  updateTeacherAccount(teacherId, { batches: assignedNames.join(', ') || '—' });

  listTeacherAccounts()
    .filter((t) => t.id !== teacherId && (t.branchId === campusId || (!t.branchId && campusId === 'lahore')))
    .forEach((t) => {
      const names = campus.filter((b) => b.teacherId === t.id).map((b) => b.name);
      updateTeacherAccount(t.id, { batches: names.join(', ') || '—' });
    });

  return campus;
}

export function matchTeacherLogin(emailOrUsername: string, password: string): Record<string, string> | null {
  const key = emailOrUsername.trim().toLowerCase();
  const row = listTeacherAccounts().find((t) => (t.email || '').toLowerCase() === key || (t.username || '').toLowerCase() === key);
  if (!row || row.password !== password) return null;
  return row;
}

export type BranchAdminAccount = {
  name: string;
  username: string;
  password: string;
};

export type CampusBranch = {
  id: string;
  name: string;
  city: string;
  students: number;
  teachers: number;
  avg: number;
  admin: string;
  adminUsername: string;
  adminPassword: string;
  admins: BranchAdminAccount[];
  imageUrl?: string;
};

const BRANCH_KEY = 'ielts-branches-v1';
const BRANCH_ADMIN_SESSION = 'ielts-branch-admin-id';
const BRANCH_ADMIN_USER = 'ielts-branch-admin-username';

function asAdmins(b: Partial<CampusBranch> & { admin?: string; adminUsername?: string; adminPassword?: string; admins?: BranchAdminAccount[] }): BranchAdminAccount[] {
  if (Array.isArray(b.admins) && b.admins.length) {
    return b.admins.map((a) => ({ name: a.name.trim(), username: a.username.trim(), password: a.password }));
  }
  if (b.adminUsername) {
    return [{ name: (b.admin || '').trim() || 'Branch Admin', username: b.adminUsername.trim(), password: b.adminPassword || '' }];
  }
  return [];
}

function syncPrimary(admins: BranchAdminAccount[]) {
  const first = admins[0];
  return {
    admins,
    admin: first?.name || '',
    adminUsername: first?.username || '',
    adminPassword: first?.password || '',
  };
}

const SEED_BRANCHES: CampusBranch[] = [];

function normalizeBranch(b: CampusBranch): CampusBranch {
  const admins = asAdmins(b);
  const imageUrl = (b.imageUrl || '').trim();
  const next: CampusBranch = { ...b, ...syncPrimary(admins) };
  if (imageUrl) next.imageUrl = imageUrl;
  else delete next.imageUrl;
  return next;
}

function loadBranches(): CampusBranch[] {
  try {
    const raw = localStorage.getItem(BRANCH_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw) as CampusBranch[];
    return Array.isArray(parsed) ? parsed.map(normalizeBranch) : [];
  } catch {
    return [];
  }
}

function writeBranches(rows: CampusBranch[]) {
  try {
    localStorage.setItem(BRANCH_KEY, JSON.stringify(rows));
  } catch {
    throw new Error('Could not save campus data. If you added a photo, try a smaller image (under 2 MB).');
  }
}

export function slugBranchId(name: string) {
  const base = name.toLowerCase().replace(/branch/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `campus-${Date.now()}`;
  const existing = loadBranches().map((b) => b.id);
  if (!existing.includes(base)) return base;
  return `${base}-${Date.now()}`;
}

const SEED_BRANCH_PHOTOS = new Set(['lahore', 'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan']);
const BRANCH_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_BRANCH_IMAGE_BYTES = 2 * 1024 * 1024;
export const BRANCH_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';

function stockBranchPhoto(id: string) {
  return SEED_BRANCH_PHOTOS.has(id) ? `/branch-${id}.jpg` : '/fti-hero-study.jpg';
}

export function branchPhoto(idOrBranch: string | Pick<CampusBranch, 'id' | 'imageUrl'> | null | undefined): string {
  if (idOrBranch && typeof idOrBranch === 'object') {
    const custom = (idOrBranch.imageUrl || '').trim();
    return custom || stockBranchPhoto(idOrBranch.id);
  }
  const id = idOrBranch || '';
  const stored = (getBranch(id)?.imageUrl || '').trim();
  return stored || stockBranchPhoto(id);
}

export function validateBranchImageFile(file: File): string | null {
  const type = (file.type || '').toLowerCase();
  const okType = BRANCH_IMAGE_TYPES.has(type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
  if (!okType) return 'Use a JPG, PNG, WebP, or GIF image.';
  if (file.size > MAX_BRANCH_IMAGE_BYTES) return 'Image must be 2 MB or smaller.';
  return null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

function compressBranchImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function readBranchImageFile(file: File): Promise<string> {
  const problem = validateBranchImageFile(file);
  if (problem) throw new Error(problem);
  const dataUrl = await fileToDataUrl(file);
  return compressBranchImage(dataUrl);
}

export function listBranches(): CampusBranch[] {
  return loadBranches();
}

export function getBranch(id: string): CampusBranch | undefined {
  return loadBranches().find((b) => b.id === id);
}

export function addBranch(input: { name: string; city: string; admins: BranchAdminAccount[]; imageUrl?: string }): CampusBranch {
  const rows = loadBranches();
  const admins = asAdmins({ admins: input.admins });
  const imageUrl = (input.imageUrl || '').trim();
  const saved: CampusBranch = {
    id: slugBranchId(input.name),
    name: input.name.trim(),
    city: input.city.trim(),
    students: 0,
    teachers: 0,
    avg: 0,
    ...(imageUrl ? { imageUrl } : {}),
    ...syncPrimary(admins),
  };
  writeBranches([saved, ...rows]);
  return saved;
}

export function updateBranch(id: string, patch: Partial<CampusBranch>): CampusBranch | null {
  const rows = loadBranches();
  const index = rows.findIndex((b) => b.id === id);
  if (index < 0) return null;
  const next = { ...rows[index], ...patch, id };
  rows[index] = normalizeBranch(next);
  writeBranches(rows);
  return rows[index];
}

export function removeBranch(id: string) {
  writeBranches(loadBranches().filter((b) => b.id !== id));
  if (localStorage.getItem(BRANCH_ADMIN_SESSION) === id) {
    localStorage.removeItem(BRANCH_ADMIN_SESSION);
    localStorage.removeItem(BRANCH_ADMIN_USER);
  }
}

export function isAdminUsernameTaken(username: string, except?: { branchId?: string; username?: string }) {
  const key = username.trim().toLowerCase();
  return loadBranches().some((b) =>
    asAdmins(b).some((a) => {
      if (a.username.toLowerCase() !== key) return false;
      if (except?.branchId === b.id && except.username?.toLowerCase() === key) return false;
      return true;
    })
  );
}

export type BranchAdminLogin = { branch: CampusBranch; admin: BranchAdminAccount };

export function matchBranchAdminLogin(username: string, password: string): BranchAdminLogin | null {
  const key = username.trim().toLowerCase();
  for (const branch of loadBranches()) {
    const admin = asAdmins(branch).find((a) => a.username.toLowerCase() === key);
    if (admin && admin.password === password) return { branch, admin };
  }
  return null;
}

export function setCurrentBranchAdmin(id: string, username?: string) {
  localStorage.setItem(BRANCH_ADMIN_SESSION, id);
  if (username) localStorage.setItem(BRANCH_ADMIN_USER, username);
}

export function getCurrentBranchAdmin(): CampusBranch | null {
  const id = localStorage.getItem(BRANCH_ADMIN_SESSION);
  return id ? getBranch(id) || null : null;
}

export function getCurrentBranchAdminUser(): BranchAdminAccount | null {
  const campus = getCurrentBranchAdmin();
  if (!campus) return null;
  const username = (localStorage.getItem(BRANCH_ADMIN_USER) || campus.adminUsername || '').toLowerCase();
  return asAdmins(campus).find((a) => a.username.toLowerCase() === username) || asAdmins(campus)[0] || null;
}

export function updateCurrentBranchAdminAccount(patch: { name?: string; username?: string; password?: string }): BranchAdminAccount | null {
  const campus = getCurrentBranchAdmin();
  const current = getCurrentBranchAdminUser();
  if (!campus || !current) return null;
  const nextUsername = (patch.username ?? current.username).trim();
  if (nextUsername.length < 3) return null;
  if (isAdminUsernameTaken(nextUsername, { branchId: campus.id, username: current.username })) return null;
  const next: BranchAdminAccount = {
    name: (patch.name ?? current.name).trim() || current.name,
    username: nextUsername,
    password: (patch.password ?? current.password) || current.password,
  };
  const admins = asAdmins(campus).map((a) =>
    a.username.toLowerCase() === current.username.toLowerCase() ? next : a
  );
  updateBranch(campus.id, { admins, ...syncPrimary(admins) });
  setCurrentBranchAdmin(campus.id, next.username);
  return next;
}

export function listAllBranchAdmins(): { branch: CampusBranch; admin: BranchAdminAccount }[] {
  return loadBranches().flatMap((branch) => asAdmins(branch).map((admin) => ({ branch, admin })));
}