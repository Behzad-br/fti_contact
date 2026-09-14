import { type FormEvent, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, Check, ClipboardCheck, FileText, GraduationCap, Headphones, ImagePlus, Library, PencilLine, Plus, Target, Trash2, Users } from 'lucide-react';
import { Avatar, Badge, Button, ProgressBar, SearchInput, SectionTitle, StatCard, StatusBadge, Toast } from '@/components/ui-kit';
import SuperAdminSettings from '@/admin/SuperAdminSettings';
import { addBranch, adminTrend, assignedBatchIdsForTeacher, BRANCH_IMAGE_ACCEPT, branchPhoto, getBranch, getCurrentBranchAdmin, getCurrentBranchAdminUser, getReviewDraft, getStudentAccount, getTeacherAccount, isAdminUsernameTaken, isStudentRemoved, listAllBranchAdmins, listBranches, listCampusBatches, listMockEntities, listStudentAccounts, listTeacherAccounts, listTeacherRoster, publishReview, readBranchImageFile, removeBranch, removeStudentAccount, removeTeacherAccount, reviewEssay, saveMockEntity, saveReviewDraft, setTeacherBatchAssignments, studentWorkReport, students, updateBranch, updateCurrentBranchAdminAccount, updateStudentAccount, updateTeacherAccount, type ReviewDraft } from '@/lib/mock-api';

function initialsFrom(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'T';
}

function campusTeachers(branchId?: string) {
  const campuses = listBranches();
  return listTeacherAccounts().map((t) => {
    const campus = campuses.find((c) => c.id === t.branchId) || campuses.find((c) => c.name === t.branchName);
    return {
      id: t.id,
      name: t.fullName || t.name || 'Teacher',
      initials: initialsFrom(t.fullName || t.name || 'T'),
      email: t.email || '',
      username: t.username || '',
      batches: t.batches || '—',
      students: Number(t.students) || 0,
      branchId: t.branchId || campus?.id || '',
      branchName: campus?.name || t.branchName || 'Unassigned',
    };
  }).filter((t) => !branchId || t.branchId === branchId);
}

type FieldSpec = { name: string; label: string; type?: string; hint?: string; autoComplete?: string };

function FormPage({
  title, eyebrow, back, fields, submitLabel, kind, validate, extra,
}: {
  title: string; eyebrow: string; back: string; fields: FieldSpec[]; submitLabel: string; kind: string;
  validate?: (data: Record<string, string>) => string | null;
  extra?: Record<string, string>;
}) {
  const [, setLocation] = useLocation();
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const problem = validate?.(data);
    if (problem) { setError(problem); return; }
    setError('');
    const { confirmPassword: _confirm, ...rest } = data;
    saveMockEntity(kind, { ...rest, ...extra });
    setToast('Saved');
    setTimeout(() => setLocation(back), 500);
  };
  return (
    <>
      <button onClick={() => setLocation(back)} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Back
      </button>
      <SectionTitle eyebrow={eyebrow} title={title} />
      <form onSubmit={submit} className="card max-w-xl space-y-4 p-6">
        {fields.map((field) => (
          <label key={field.name} className="block text-sm font-semibold">
            {field.label}
            <input
              name={field.name}
              type={field.type || 'text'}
              required
              minLength={field.type === 'password' ? 6 : undefined}
              autoComplete={field.autoComplete}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
            {field.hint && <span className="mt-1 block text-xs font-normal text-muted-foreground">{field.hint}</span>}
          </label>
        ))}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit">{submitLabel}</Button>
      </form>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

function campusBatches(branchId?: string) {
  return listCampusBatches(branchId);
}

function networkStudents(branchId?: string) {
  const campuses = listBranches();
  const created = listMockEntities('student').map((s) => {
    const campus = campuses.find((c) => c.id === s.branchId) || campuses.find((c) => c.name === s.branchName);
    const name = s.fullName || s.name || 'Student';
    return {
      id: s.id,
      name,
      initials: initialsFrom(name),
      email: s.email || '',
      batch: s.batch || 'Unassigned',
      band: Number(s.band) || 0,
      branchId: s.branchId || campus?.id || '',
      branchName: campus?.name || s.branchName || 'Unassigned',
    };
  });
  const seed = [
    ...students.map((s) => ({ id: s.id, name: s.name, initials: s.initials, email: s.email, batch: s.batch, band: s.band, branchId: 'lahore', branchName: 'Lahore Branch' })),
    { id: 'k1', name: 'Hassan Ali', initials: 'HA', email: 'hassan.ali@example.com', batch: 'Morning Batch A', band: 6.0, branchId: 'karachi', branchName: 'Karachi Branch' },
    { id: 'k2', name: 'Amina Khan', initials: 'AK', email: 'amina.khan@example.com', batch: 'Evening Batch A', band: 6.5, branchId: 'karachi', branchName: 'Karachi Branch' },
    { id: 'i1', name: 'Noor Fatima', initials: 'NF', email: 'noor.fatima@example.com', batch: 'Weekend Batch', band: 6.8, branchId: 'islamabad', branchName: 'Islamabad Branch' },
    { id: 'i2', name: 'Tariq Mehmood', initials: 'TM', email: 'tariq.mehmood@example.com', batch: 'Morning Batch A', band: 5.5, branchId: 'islamabad', branchName: 'Islamabad Branch' },
    { id: 'r1', name: 'Saba Qureshi', initials: 'SQ', email: 'saba.qureshi@example.com', batch: 'Evening Batch B', band: 6.2, branchId: 'rawalpindi', branchName: 'Rawalpindi Branch' },
    { id: 'f1', name: 'Danish Iqbal', initials: 'DI', email: 'danish.iqbal@example.com', batch: 'Morning Batch A', band: 5.8, branchId: 'faisalabad', branchName: 'Faisalabad Branch' },
    { id: 'm1', name: 'Hira Nawaz', initials: 'HN', email: 'hira.nawaz@example.com', batch: 'Afternoon Batch', band: 6.3, branchId: 'multan', branchName: 'Multan Branch' },
  ];
  const extra = seed.filter((s) =>
    !isStudentRemoved(s.id, s.email) &&
    !created.some((c) => (c.email && s.email && c.email.toLowerCase() === s.email.toLowerCase()) || c.id === s.id)
  );
  return [...created, ...extra].filter((s) =>
    !isStudentRemoved(s.id, s.email) &&
    (!branchId || s.branchId === branchId)
  );
}

export function AdminDashboard() {
  const [, setLocation] = useLocation();
  const branches = listBranches();
  const totalStudents = branches.reduce((n, b) => n + b.students, 0);
  const totalTeachers = branches.reduce((n, b) => n + b.teachers, 0);
  return (
    <>
      <SectionTitle
        eyebrow="Super Admin"
        title="FTI network overview"
        description="All six Pakistan campuses in one desk — branches, admins, and estimated practice bands."
        action={<Button onClick={() => setLocation('/admin/branches/new')}><Plus size={16} />Add branch</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={String(branches.length)} detail="Active campuses" icon={<Library size={17} />} />
        <StatCard label="Students" value={String(totalStudents)} detail="Active this term" icon={<GraduationCap size={17} />} accent="amber" />
        <StatCard label="Teachers" value={String(totalTeachers)} detail="Across the network" icon={<BriefcaseBusiness size={17} />} accent="blue" />
        <StatCard label="Network avg band" value="6.3" detail="+0.2 this month" icon={<Target size={17} />} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="card p-6">
          <div className="eyebrow">Network</div>
          <h2 className="mt-1 font-display text-lg font-bold">Practice volume & band</h2>
          <div className="mt-5 h-[255px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={adminTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e0d4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" domain={[5, 7]} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line yAxisId="l" type="monotone" dataKey="band" stroke="#17665e" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Attention</div>
              <h2 className="mt-1 font-display text-lg font-bold">Campuses to watch</h2>
            </div>
            <Link href="/admin/branches" className="text-xs font-bold text-primary">All branches</Link>
          </div>
          <div className="mt-5 space-y-3">
            {branches.slice().sort((a, b) => a.avg - b.avg).slice(0, 4).map((b) => (
              <Link key={b.id} href={`/admin/branches/${b.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                <img src={branchPhoto(b)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{b.name}</span>
                  <span className="block text-xs text-muted-foreground">{b.students} students · {b.admin}</span>
                </span>
                <strong className="text-sm">{b.avg.toFixed(1)}</strong>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export function AdminTablePage({ page }: { page: string }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [campusFilter, setCampusFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [branches, setBranches] = useState(listBranches);
  const [toast, setToast] = useState('');
  const reload = () => setBranches(listBranches());
  const titles: Record<string, [string, string]> = {
    branches: ['Branches', 'Rename a campus, set its admin login, or remove it from the network.'],
    'branch-admins': ['Branch admins', 'Campus leads who run teachers and batches.'],
    'practice-papers': ['Practice papers', 'Network question banks and mocks.'],
    teachers: ['Teachers', 'Every campus faculty in one place, with the branch name next to each teacher.'],
    students: ['Students', 'Learners grouped by campus, then by batch.'],
    batches: ['Batches', 'Cohorts grouped by campus timetable.'],
    questions: ['Question bank', 'Writing, reading, listening, and speaking items.'],
    reports: ['Reports', 'Volume, bands, and campus comparisons.'],
    'ai-settings': ['AI settings', 'Estimated scoring and generation controls.'],
    audit: ['Audit log', 'Who changed what, and when.'],
    settings: ['Settings', 'Network-wide LMS preferences.'],
  };
  const t = titles[page] || titles.branches;

  if (page === 'reports') return <Reports />;
  if (page === 'settings') return <SuperAdminSettings />;
  if (page === 'ai-settings') {
    return (
      <>
        <SectionTitle eyebrow="Super Admin" title={t[0]} description={t[1]} />
        <div className="card max-w-xl space-y-4 p-6">
          <label className="block text-sm font-semibold">Academy name<input defaultValue="FTI IELTS Learning Management System" className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
          <label className="block text-sm font-semibold">Default target band<select className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm"><option>7.0</option><option>6.5</option><option>7.5</option></select></label>
          <p className="text-xs text-muted-foreground">AI scores stay labelled as estimated practice bands, never official IELTS.</p>
          <Button>Save settings</Button>
        </div>
      </>
    );
  }
  if (page === 'audit') {
    const rows = [['Sara Khan added a teacher', 'Lahore', '2h ago'], ['Practice paper published', 'Network', 'Yesterday'], ['Branch admin password reset', 'Multan', '2 days ago']];
    return (
      <>
        <SectionTitle eyebrow="Super Admin" title={t[0]} description={t[1]} />
        <div className="card divide-y divide-border">
          {rows.map((r) => (
            <div key={r[0]} className="flex items-center justify-between p-4 text-sm">
              <div>
                <div className="font-semibold">{r[0]}</div>
                <div className="text-xs text-muted-foreground">{r[1]}</div>
              </div>
              <span className="text-xs text-muted-foreground">{r[2]}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  const action =
    page === 'branches' ? <Button onClick={() => setLocation('/admin/branches/new')}><Plus size={16} />Add branch</Button>
    : page === 'practice-papers' ? <Button onClick={() => setLocation('/admin/practice-papers/new')}><Plus size={16} />Add paper</Button>
    : undefined;

  return (
    <>
      <SectionTitle eyebrow="Super Admin" title={t[0]} description={t[1]} action={action} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${page.replace('-', ' ')}`} />
        {(page === 'teachers' || page === 'students') && (
          <select value={campusFilter} onChange={(e) => { setCampusFilter(e.target.value); setBatchFilter('all'); }} className="h-10 rounded-lg border border-input bg-card px-3 text-sm font-semibold">
            <option value="all">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {page === 'students' && (
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm font-semibold">
            <option value="all">All batches</option>
            {Array.from(new Set(networkStudents(campusFilter === 'all' ? undefined : campusFilter).map((s) => s.batch))).map((batch) => (
              <option key={batch} value={batch}>{batch}</option>
            ))}
          </select>
        )}
      </div>
      {page === 'branches' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()) || b.city.toLowerCase().includes(query.toLowerCase())).map((b) => (
            <div key={b.id} className="card overflow-hidden">
              <img src={branchPhoto(b)} alt="" className="h-28 w-full object-cover" />
              <div className="p-5">
                <h2 className="font-display text-lg font-bold">{b.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{(b.admins?.length || 1)} admin{(b.admins?.length || 1) === 1 ? '' : 's'} · {b.students} students</p>
                <div className="mt-4 flex justify-between text-sm"><span>Avg band</span><strong>{b.avg.toFixed(1)}</strong></div>
                <ProgressBar value={Math.min(100, b.avg * 12)} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="flex-1" variant="quiet" onClick={() => setLocation(`/admin/branches/${b.id}`)}><PencilLine size={15} />Edit</Button>
                  <Button className="flex-1" variant="danger" onClick={() => {
                    if (!window.confirm(`Remove ${b.name}? This campus will disappear from the network and its admin can no longer sign in.`)) return;
                    removeBranch(b.id);
                    reload();
                    setToast(`${b.name} removed`);
                  }}><Trash2 size={15} />Remove</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : page === 'branch-admins' ? (
        <div className="card overflow-hidden">
          {listAllBranchAdmins().filter(({ branch, admin }) =>
            admin.name.toLowerCase().includes(query.toLowerCase()) ||
            admin.username.toLowerCase().includes(query.toLowerCase()) ||
            branch.name.toLowerCase().includes(query.toLowerCase())
          ).map(({ branch, admin }) => (
            <div key={`${branch.id}-${admin.username}`} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
              <Avatar initials={admin.name.split(' ').map((p) => p[0]).join('').slice(0, 2)} size="sm" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{admin.name}</div>
                <div className="text-xs text-muted-foreground">{branch.name} · @{admin.username} · equal branch-admin rights</div>
              </div>
              <Button variant="quiet" onClick={() => setLocation(`/admin/branches/${branch.id}`)}>Manage</Button>
            </div>
          ))}
        </div>
      ) : page === 'teachers' ? (
        <div className="space-y-5">
          {(() => {
            const q = query.toLowerCase();
            const faculty = campusTeachers(campusFilter === 'all' ? undefined : campusFilter).filter((row) =>
              row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q) || row.branchName.toLowerCase().includes(q)
            );
            const groups = (campusFilter === 'all' ? branches : branches.filter((b) => b.id === campusFilter)).map((campus) => ({
              campus,
              rows: faculty.filter((row) => row.branchId === campus.id || (!row.branchId && row.branchName === campus.name)),
            })).filter((g) => campusFilter !== 'all' || g.rows.length > 0);
            const unassigned = faculty.filter((row) => !branches.some((b) => b.id === row.branchId || b.name === row.branchName));
            if (!faculty.length) {
              return <p className="card p-8 text-center text-sm text-muted-foreground">No teachers match this search.</p>;
            }
            return (
              <>
                {groups.map(({ campus, rows }) => (
                  <div key={campus.id} className="card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                      <div>
                        <div className="font-display text-base font-bold">{campus.name}</div>
                        <div className="text-xs text-muted-foreground">{campus.city} · {rows.length} teacher{rows.length === 1 ? '' : 's'}</div>
                      </div>
                      <Badge tone="blue">{campus.city}</Badge>
                    </div>
                    {rows.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-muted-foreground">No teachers on this campus yet.</p>
                    ) : rows.map((row) => (
                      <div key={row.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
                        <Avatar initials={row.initials} size="sm" tone="amber" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.email}{row.username ? ` · @${row.username}` : ''}</div>
                        </div>
                        <span className="hidden text-xs text-muted-foreground sm:block">{row.batches}</span>
                        <Badge>{campus.name}</Badge>
                      </div>
                    ))}
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="border-b border-border bg-muted/40 px-5 py-3 font-display text-base font-bold">Unassigned</div>
                    {unassigned.map((row) => (
                      <div key={row.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
                        <Avatar initials={row.initials} size="sm" tone="amber" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold">{row.name}</div>
                          <div className="text-xs text-muted-foreground">{row.email}</div>
                        </div>
                        <Badge>No branch</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : page === 'students' ? (
        <div className="space-y-5">
          {(() => {
            const q = query.toLowerCase();
            const learners = networkStudents(campusFilter === 'all' ? undefined : campusFilter).filter((s) =>
              (batchFilter === 'all' || s.batch === batchFilter) &&
              (s.name.toLowerCase().includes(q) || s.batch.toLowerCase().includes(q) || s.branchName.toLowerCase().includes(q))
            );
            const campusList = campusFilter === 'all' ? branches : branches.filter((b) => b.id === campusFilter);
            if (!learners.length) {
              return <p className="card p-8 text-center text-sm text-muted-foreground">No students match this branch or batch.</p>;
            }
            return campusList.map((campus) => {
              const campusRows = learners.filter((s) => s.branchId === campus.id);
              if (!campusRows.length) return null;
              const batchNames = Array.from(new Set(campusRows.map((s) => s.batch)));
              return (
                <div key={campus.id} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                    <div>
                      <div className="font-display text-base font-bold">{campus.name}</div>
                      <div className="text-xs text-muted-foreground">{campusRows.length} student{campusRows.length === 1 ? '' : 's'} · {batchNames.length} batch{batchNames.length === 1 ? '' : 'es'}</div>
                    </div>
                    <Badge tone="blue">{campus.city}</Badge>
                  </div>
                  {batchNames.map((batch) => {
                    const rows = campusRows.filter((s) => s.batch === batch);
                    return (
                      <div key={batch} className="border-b border-border last:border-0">
                        <div className="flex items-center justify-between bg-muted/20 px-5 py-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{batch}</span>
                          <span className="text-xs text-muted-foreground">{rows.length} learner{rows.length === 1 ? '' : 's'}</span>
                        </div>
                        {rows.map((s) => (
                          <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                            <Avatar initials={s.initials} size="sm" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{s.name}</div>
                              <div className="text-xs text-muted-foreground">{s.email || campus.name}</div>
                            </div>
                            <Badge>{campus.name}</Badge>
                            {s.band > 0 && <strong className="text-sm">{s.band.toFixed(1)}</strong>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      ) : page === 'batches' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {campusBatches().map((b) => (
            <div key={b.id} className="card p-5">
              <h2 className="font-display text-lg font-bold">{b.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{b.schedule}{b.teacher ? ` · ${b.teacher}` : ''}</p>
              <div className="mt-4 flex justify-between text-sm"><span>{b.students} learners</span><strong>{b.avg}</strong></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {['Writing Task 2 · Community service', 'Reading · The history of tea', 'Listening Part 2 · Campus tour', 'Speaking Part 3 · Cities'].filter((q) => q.toLowerCase().includes(query.toLowerCase())).map((q) => (
            <div key={q} className="card flex items-center justify-between p-4">
              <span className="text-sm font-semibold">{q}</span>
              <Badge>Bank</Badge>
            </div>
          ))}
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

type AdminDraft = { name: string; username: string; password: string; confirm: string };
const blankAdmin = (): AdminDraft => ({ name: '', username: '', password: '', confirm: '' });

function CampusImageField({
  previewSrc,
  hasCustomImage,
  onPick,
  onClear,
  error,
}: {
  previewSrc: string;
  hasCustomImage: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="text-sm font-semibold">Campus image</div>
      <p className="mt-1 text-xs font-normal text-muted-foreground">Optional. JPG, PNG, WebP or GIF, up to 2 MB. Shown on the branch list and campus page.</p>
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3">
        <img data-testid="campus-image-preview" src={previewSrc} alt="Campus preview" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            data-testid="input-campus-image"
            type="file"
            accept={BRANCH_IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="quiet" onClick={() => inputRef.current?.click()}>
              <ImagePlus size={15} />{hasCustomImage ? 'Replace image' : 'Choose image'}
            </Button>
            {hasCustomImage && (
              <button type="button" className="text-xs font-semibold text-red-700" onClick={onClear}>Remove</button>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-normal text-red-700">{error}</p>}
    </div>
  );
}

function validateAdmins(admins: AdminDraft[], exceptBranchId?: string): string | null {
  if (!admins.length) return 'Add at least one branch admin.';
  const seen = new Set<string>();
  for (let i = 0; i < admins.length; i++) {
    const a = admins[i];
    if (!a.name.trim()) return `Admin ${i + 1}: enter a full name.`;
    if (a.username.trim().length < 3) return `Admin ${i + 1}: username must be at least 3 characters.`;
    if (a.password.length < 6) return `Admin ${i + 1}: password must be at least 6 characters.`;
    if (a.password !== a.confirm) return `Admin ${i + 1}: passwords do not match.`;
    const key = a.username.trim().toLowerCase();
    if (seen.has(key)) return `Username @${a.username.trim()} is used twice on this campus.`;
    seen.add(key);
    if (isAdminUsernameTaken(a.username, { branchId: exceptBranchId, username: a.username })) {
      return `Username @${a.username.trim()} is already used by another admin.`;
    }
  }
  return null;
}

export function AddBranchPage() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [admins, setAdmins] = useState<AdminDraft[]>([blankAdmin()]);
  const updateAdmin = (index: number, patch: Partial<AdminDraft>) => {
    setAdmins((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const pickImage = async (file: File) => {
    try {
      setImageError('');
      setImageUrl(await readBranchImageFile(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not use that image.');
    }
  };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const problem = validateAdmins(admins);
    if (problem) { setError(problem); return; }
    try {
      addBranch({
        name: data.name,
        city: data.city,
        imageUrl: imageUrl || undefined,
        admins: admins.map((a) => ({ name: a.name.trim(), username: a.username.trim(), password: a.password })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this campus.');
      return;
    }
    setLocation('/admin/branches');
  };
  return (
    <>
      <button onClick={() => setLocation('/admin/branches')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back</button>
      <SectionTitle eyebrow="Super Admin" title="Add a campus" description="Add one or more branch admins. Every admin on this campus has the same rights and can log in separately." />
      <form onSubmit={submit} className="card max-w-xl space-y-4 p-6">
        <CampusImageField
          previewSrc={branchPhoto({ id: '', imageUrl })}
          hasCustomImage={Boolean(imageUrl)}
          onPick={pickImage}
          onClear={() => { setImageUrl(''); setImageError(''); }}
          error={imageError}
        />
        <label className="block text-sm font-semibold">Branch name<input name="name" required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
        <label className="block text-sm font-semibold">City<input name="city" required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="eyebrow">Branch admin logins</div>
            <Button type="button" variant="quiet" onClick={() => setAdmins((rows) => [...rows, blankAdmin()])}><Plus size={15} />Add another admin</Button>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">All admins on this campus have equal access to teachers, students, and batches.</p>
          {admins.map((admin, index) => (
            <div key={index} className="mb-4 rounded-xl border border-border p-4 last:mb-0">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold">Admin {index + 1}</span>
                {admins.length > 1 && (
                  <button type="button" className="text-xs font-semibold text-red-700" onClick={() => setAdmins((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
                )}
              </div>
              <label className="block text-sm font-semibold">Admin full name<input value={admin.name} onChange={(e) => updateAdmin(index, { name: e.target.value })} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
              <label className="mt-3 block text-sm font-semibold">Username<input value={admin.username} onChange={(e) => updateAdmin(index, { username: e.target.value })} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
              <label className="mt-3 block text-sm font-semibold">Password<input type="password" value={admin.password} onChange={(e) => updateAdmin(index, { password: e.target.value })} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
              <label className="mt-3 block text-sm font-semibold">Confirm password<input type="password" value={admin.confirm} onChange={(e) => updateAdmin(index, { confirm: e.target.value })} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit">Create branch</Button>
      </form>
    </>
  );
}

export function AddPracticePaperPage() {
  return <FormPage kind="paper" eyebrow="Super Admin" title="Add a practice paper" back="/admin/practice-papers" submitLabel="Save paper" fields={[{name:'title',label:'Title'},{name:'module',label:'Module'},{name:'level',label:'Level'}]} />;
}

export function BranchDetailPage({ branchId }: { branchId: string }) {
  const [, setLocation] = useLocation();
  const existing = getBranch(branchId);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState(existing?.name || '');
  const [city, setCity] = useState(existing?.city || '');
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl || '');
  const [imageError, setImageError] = useState('');
  const [admins, setAdmins] = useState<AdminDraft[]>(() =>
    (existing?.admins?.length ? existing.admins : existing ? [{ name: existing.admin, username: existing.adminUsername, password: existing.adminPassword }] : [blankAdmin()]).map((a) => ({
      name: a.name,
      username: a.username,
      password: a.password,
      confirm: a.password,
    }))
  );
  const updateAdmin = (index: number, patch: Partial<AdminDraft>) => {
    setAdmins((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const pickImage = async (file: File) => {
    try {
      setImageError('');
      setImageUrl(await readBranchImageFile(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not use that image.');
    }
  };

  if (!existing) {
    return (
      <div className="card p-8 text-center">
        <h2 className="font-display text-xl font-bold">This branch was removed.</h2>
        <Button className="mt-5" onClick={() => setLocation('/admin/branches')}>Back to branches</Button>
      </div>
    );
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateAdmins(admins, branchId);
    if (problem) { setError(problem); return; }
    try {
      updateBranch(branchId, {
        name: name.trim(),
        city: city.trim(),
        imageUrl: imageUrl.trim(),
        admins: admins.map((a) => ({ name: a.name.trim(), username: a.username.trim(), password: a.password })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this campus.');
      return;
    }
    setError('');
    setToast('Campus saved. Every listed admin can sign in with equal rights.');
  };

  return (
    <>
      <button onClick={() => setLocation('/admin/branches')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />All branches</button>
      <div className="overflow-hidden rounded-2xl border border-border">
        <img src={branchPhoto({ id: existing.id, imageUrl })} alt="" className="h-44 w-full object-cover" />
        <div className="bg-card p-6">
          <SectionTitle
            eyebrow={existing.city}
            title={existing.name}
            description="Add as many branch admins as you need. They all have the same rights on this campus."
            action={<Button variant="danger" onClick={() => {
              if (!window.confirm(`Remove ${existing.name}?`)) return;
              removeBranch(branchId);
              setLocation('/admin/branches');
            }}><Trash2 size={15} />Remove branch</Button>}
          />
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Students" value={String(existing.students)} icon={<GraduationCap size={17} />} />
            <StatCard label="Teachers" value={String(existing.teachers)} icon={<BriefcaseBusiness size={17} />} accent="amber" />
            <StatCard label="Admins" value={String(admins.length)} icon={<BriefcaseBusiness size={17} />} accent="blue" />
          </div>
          <form onSubmit={save} className="space-y-6">
            <CampusImageField
              previewSrc={branchPhoto({ id: existing.id, imageUrl })}
              hasCustomImage={Boolean(imageUrl)}
              onPick={pickImage}
              onClear={() => { setImageUrl(''); setImageError(''); }}
              error={imageError}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-semibold">Branch name<input value={name} onChange={(e) => setName(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
              <label className="block text-sm font-semibold">City<input value={city} onChange={(e) => setCity(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="eyebrow">Branch admins · equal rights</div>
                <Button type="button" variant="quiet" onClick={() => setAdmins((rows) => [...rows, blankAdmin()])}><Plus size={15} />Add another admin</Button>
              </div>
              {admins.map((admin, index) => (
                <div key={index} className="mb-4 rounded-xl border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold">Admin {index + 1}</span>
                    {admins.length > 1 && (
                      <button type="button" className="text-xs font-semibold text-red-700" onClick={() => setAdmins((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">Full name<input value={admin.name} onChange={(e) => updateAdmin(index, { name: e.target.value })} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
                    <label className="block text-sm font-semibold">Username<input value={admin.username} onChange={(e) => updateAdmin(index, { username: e.target.value })} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
                    <label className="block text-sm font-semibold">Password<input type="password" value={admin.password} onChange={(e) => updateAdmin(index, { password: e.target.value })} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
                    <label className="block text-sm font-semibold">Confirm password<input type="password" value={admin.confirm} onChange={(e) => updateAdmin(index, { confirm: e.target.value })} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit">Save campus &amp; admins</Button>
          </form>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

export function BranchAdminSettingsPage() {
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const current = getCurrentBranchAdminUser();
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [name, setName] = useState(current?.name || '');
  const [username, setUsername] = useState(current?.username || '');
  const [password, setPassword] = useState(current?.password || '');
  const [confirmPassword, setConfirmPassword] = useState(current?.password || '');

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter your name.'); return; }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (isAdminUsernameTaken(username, { branchId: campus?.id, username: current?.username })) {
      setError('This username is already used by another branch admin.');
      return;
    }
    const saved = updateCurrentBranchAdminAccount({ name: name.trim(), username: username.trim(), password });
    if (!saved) { setError('Could not save your account.'); return; }
    setError('');
    setToast('Your name and password are saved. Use these details next time you sign in.');
  };

  return (
    <>
      <SectionTitle
        eyebrow={campus?.name || 'Branch Admin'}
        title="Your account"
        description="Update your display name, username, or password. This only changes your own login — not other admins on this campus."
      />
      <form onSubmit={save} className="card max-w-xl space-y-4 p-6">
        <label className="block text-sm font-semibold">Full name
          <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold">Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">You sign in with this username.</span>
        </label>
        <label className="block text-sm font-semibold">Password
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Shown so you can review or change it. At least 6 characters.</span>
        </label>
        <label className="block text-sm font-semibold">Confirm password
          <input type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit">Save my account</Button>
      </form>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

export function BranchAdminDashboard() {
  const [, setLocation] = useLocation();
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const adminUser = getCurrentBranchAdminUser();
  const faculty = campusTeachers(campus?.id);
  const batches = campusBatches(campus?.id);
  return (
    <>
      <SectionTitle
        eyebrow={campus?.name || 'Branch'}
        title={`Good morning, ${(adminUser?.name || campus?.admin || 'Admin').split(' ')[0]}.`}
        description="Teachers, batches, and student movement for this campus."
        action={<Button onClick={() => setLocation('/branch-admin/teachers/new')}><Plus size={16} />Add teacher</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teachers" value={String(faculty.length)} detail="On this campus" icon={<BriefcaseBusiness size={17} />} />
        <StatCard label="Students" value={String(campus?.students ?? 0)} detail={`${batches.length} batches`} icon={<GraduationCap size={17} />} accent="amber" />
        <StatCard label="Campus avg" value={(campus?.avg ?? 0).toFixed(1)} detail="+0.3 this term" icon={<Target size={17} />} accent="blue" />
        <StatCard label="Batches" value={String(batches.length)} detail="Morning and evening" icon={<Users size={17} />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Quick view</div>
              <h2 className="font-display text-lg font-bold">Batches</h2>
            </div>
            <Link href="/branch-admin/batches" className="text-xs font-bold text-primary">View all</Link>
          </div>
          <div className="mt-4 space-y-3">
            {batches.slice(0, 4).map((b) => (
              <Link key={b.id} href={`/branch-admin/batches/${encodeURIComponent(b.name || b.id)}`} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40">
                <div>
                  <div className="text-sm font-semibold">{b.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{b.teacher ? `Teacher · ${b.teacher}` : 'No teacher'} · {b.students} learners</div>
                </div>
                <strong className="text-sm">{b.avg}</strong>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="font-display text-lg font-bold">Campus trend</h2>
          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adminTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e0d4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="attempts" fill="#e2a24b" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

export function BranchAdminTablePage({ page }: { page: string }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const faculty = campusTeachers(campus?.id);
  if (page === 'reports') return <Reports />;
  const titles: Record<string, [string, string]> = {
    teachers: ['Teachers', 'Open a teacher to view or change their login email, username, and password.'],
    students: ['Students', 'Open a student to change their login email and password, or remove them from this branch.'],
    batches: ['Batches', 'Morning and evening cohorts.'],
  };
  const t = titles[page] || titles.teachers;
  const action =
    page === 'teachers' ? <Button onClick={() => setLocation('/branch-admin/teachers/new')}><Plus size={16} />Add teacher</Button>
    : page === 'students' ? <Button onClick={() => setLocation('/branch-admin/students/new')}><Plus size={16} />Add student</Button>
    : <Button onClick={() => setLocation('/branch-admin/batches/new')}><Plus size={16} />Add batch</Button>;
  return (
    <>
      <SectionTitle eyebrow="Branch Admin" title={t[0]} description={t[1]} action={action} />
      <div className="mb-5"><SearchInput value={query} onChange={setQuery} /></div>
      {page === 'teachers' && (
        <div className="card overflow-hidden">
          {faculty.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No teachers on this campus yet.</p>
          )}
          {faculty.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())).map((row) => (
            <div key={row.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0 hover:bg-muted/40">
              <button
                type="button"
                onClick={() => setLocation(`/branch-admin/teachers/${encodeURIComponent(row.id)}`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Avatar initials={row.initials} size="sm" tone="amber" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{row.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{row.email}</div>
                  {row.username && <div className="mt-0.5 text-[11px] text-muted-foreground">Login · @{row.username}</div>}
                </div>
                <Badge tone="green">Credentials set</Badge>
                <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (!confirm(`Delete ${row.name}? They will no longer be able to sign in, and their batches will be unassigned.`)) return;
                  removeTeacherAccount(row.id);
                  setToast(`${row.name} has been removed.`);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      {page === 'students' && (
        <div className="space-y-4">
          {(() => {
            const learners = networkStudents(campus?.id).filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.batch.toLowerCase().includes(query.toLowerCase()));
            const batchNames = Array.from(new Set(learners.map((s) => s.batch)));
            if (!learners.length) return <p className="card p-6 text-center text-sm text-muted-foreground">No students in this campus yet.</p>;
            return batchNames.map((batch) => {
              const rows = learners.filter((s) => s.batch === batch);
              return (
                <div key={batch} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                    <span className="text-sm font-bold">{batch}</span>
                    <span className="text-xs text-muted-foreground">{rows.length} student{rows.length === 1 ? '' : 's'}</span>
                  </div>
                  {rows.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0 hover:bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setLocation(`/branch-admin/students/${s.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Avatar initials={s.initials} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{s.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{campus?.name} · {s.batch}</div>
                        </div>
                        {s.band > 0 && <strong>{s.band.toFixed(1)}</strong>}
                        <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (!confirm(`Delete ${s.name} from this branch? They will be removed from ${s.batch}.`)) return;
                          removeStudentAccount(s.id, s.email);
                          setToast(`${s.name} has been removed.`);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              );
            });
          })()}
        </div>
      )}
      {page === 'batches' && (
        <div className="grid gap-4 md:grid-cols-3">
          {campusBatches(campus?.id).filter((b) => (b.name || b.id).toLowerCase().includes(query.toLowerCase())).map((b) => (
            <Link key={b.id} href={`/branch-admin/batches/${encodeURIComponent(b.name || b.id)}`} className="card p-5 hover:border-primary">
              <h2 className="font-display text-lg font-bold">{b.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{b.schedule}</p>
              <p className="mt-2 text-sm font-semibold">{b.teacher ? `Teacher · ${b.teacher}` : 'No teacher assigned'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{b.subjects || 'All four skills'}</p>
              <div className="mt-3 flex justify-between text-sm"><span className="text-muted-foreground">{b.students} learners</span><strong>{b.avg}</strong></div>
            </Link>
          ))}
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

export function AddTeacherPage() {
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  return (
    <FormPage
      kind="teacher"
      eyebrow="Branch Admin"
      title="Add a teacher"
      back="/branch-admin/teachers"
      submitLabel="Create teacher"
      extra={{ branchId: campus?.id || '', branchName: campus?.name || '' }}
      validate={(data) => {
        if (!data.email?.includes('@')) return 'Enter a valid email — this is their login.';
        if ((data.username || '').trim().length < 3) return 'Username must be at least 3 characters.';
        if ((data.password || '').length < 6) return 'Password must be at least 6 characters.';
        if (data.password !== data.confirmPassword) return 'Password and confirm password do not match.';
        const taken = listTeacherAccounts().some((t) =>
          t.email?.toLowerCase() === data.email.toLowerCase() || t.username?.toLowerCase() === data.username.toLowerCase()
        );
        if (taken) return 'This email or username is already used by another teacher.';
        return null;
      }}
      fields={[
        { name: 'fullName', label: 'Full name', autoComplete: 'name' },
        { name: 'email', label: 'Login email', type: 'email', hint: 'Teacher signs in with this email.', autoComplete: 'email' },
        { name: 'username', label: 'Username', hint: 'They can also sign in with this username.', autoComplete: 'username' },
        { name: 'password', label: 'Password', type: 'password', hint: 'At least 6 characters. Share this privately with the teacher.', autoComplete: 'new-password' },
        { name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password' },
      ]}
    />
  );
}

export function EditTeacherPage({ teacherId }: { teacherId: string }) {
  const [, setLocation] = useLocation();
  const teacher = getTeacherAccount(decodeURIComponent(teacherId));
  const campusBatchesForTeacher = listCampusBatches(teacher?.branchId);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState(teacher?.fullName || teacher?.name || '');
  const [email, setEmail] = useState(teacher?.email || '');
  const [username, setUsername] = useState(teacher?.username || '');
  const [password, setPassword] = useState(teacher?.password || '');
  const [confirmPassword, setConfirmPassword] = useState(teacher?.password || '');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(() =>
    teacher ? assignedBatchIdsForTeacher(teacher.id) : []
  );

  if (!teacher) {
    return (
      <div className="card p-8 text-center">
        <h2 className="font-display text-xl font-bold">Teacher not found.</h2>
        <Button className="mt-5" onClick={() => setLocation('/branch-admin/teachers')}>Back to teachers</Button>
      </div>
    );
  }

  const assignedNow = campusBatchesForTeacher.filter((b) => selectedBatchIds.includes(b.id));
  const availableNow = campusBatchesForTeacher.filter((b) => !selectedBatchIds.includes(b.id));

  const toggleBatch = (id: string) => {
    setSelectedBatchIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid login email.'); return; }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    const taken = listTeacherAccounts().some((t) =>
      t.id !== teacher.id && (t.email?.toLowerCase() === email.toLowerCase() || t.username?.toLowerCase() === username.toLowerCase())
    );
    if (taken) { setError('This email or username is already used by another teacher.'); return; }
    updateTeacherAccount(teacher.id, {
      fullName: fullName.trim(),
      name: fullName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
    });
    setTeacherBatchAssignments(teacher.id, selectedBatchIds);
    setError('');
    const batchNote = selectedBatchIds.length
      ? `${selectedBatchIds.length} batch${selectedBatchIds.length === 1 ? '' : 'es'} assigned.`
      : 'No batches assigned.';
    setToast(`Saved. ${batchNote} The teacher can sign in with this email or username.`);
  };

  return (
    <>
      <button onClick={() => setLocation('/branch-admin/teachers')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Back to teachers
      </button>
      <SectionTitle
        eyebrow="Branch Admin"
        title={fullName || 'Teacher credentials'}
        description="Current login details are shown below. Change name, email, username, password, or batches anytime."
      />
      <form onSubmit={save} className="max-w-xl space-y-4">
        <div className="card space-y-4 p-6">
          <label className="block text-sm font-semibold">Full name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
          <label className="block text-sm font-semibold">Login email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Teacher signs in with this email.</span>
          </label>
          <label className="block text-sm font-semibold">Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Password
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Shown so you can share or change it. At least 6 characters.</span>
          </label>
          <label className="block text-sm font-semibold">Confirm password<input type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <h3 className="text-sm font-bold">Batches</h3>
            <p className="mt-1 text-xs text-muted-foreground">Tick every batch this teacher should teach. One teacher can have more than one batch.</p>
          </div>
          {campusBatchesForTeacher.length === 0 ? (
            <p className="text-sm text-amber-800">No batches on this campus yet. Create a batch first, then assign it here.</p>
          ) : (
            <>
              {assignedNow.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Already assigned</p>
                  <div className="space-y-2">
                    {assignedNow.map((b) => (
                      <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                        <input type="checkbox" checked onChange={() => toggleBatch(b.id)} className="mt-1" />
                        <span>
                          <span className="block text-sm font-semibold">{b.name}</span>
                          <span className="text-xs text-muted-foreground">{b.schedule || 'No schedule'} · Assigned to this teacher</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {availableNow.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Available to assign</p>
                  <div className="space-y-2">
                    {availableNow.map((b) => (
                      <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-input px-3 py-3">
                        <input type="checkbox" checked={false} onChange={() => toggleBatch(b.id)} className="mt-1" />
                        <span>
                          <span className="block text-sm font-semibold">{b.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {b.schedule || 'No schedule'}
                            {b.teacher ? ` · Currently with ${b.teacher}` : ' · Not assigned yet'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">Save credentials & batches</Button>
          <button
            type="button"
            className="h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
            onClick={() => {
              if (!confirm(`Delete ${fullName || 'this teacher'}? They will no longer be able to sign in, and their batches will be unassigned.`)) return;
              removeTeacherAccount(teacher.id);
              setLocation('/branch-admin/teachers');
            }}
          >
            Delete teacher
          </button>
        </div>
      </form>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
export function AddStudentPage() {
  const [, setLocation] = useLocation();
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const batchOptions = campusBatches(campus?.id);
  const [batch, setBatch] = useState(batchOptions[0]?.name || '');
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!batch) { setError('Create a batch first, then add students to it.'); return; }
    if (!data.email?.includes('@')) { setError('Enter a valid login email.'); return; }
    if ((data.password || '').length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (data.password !== data.confirmPassword) { setError('Passwords do not match.'); return; }
    const loginId = (data.username || data.email.split('@')[0]).trim();
    const taken = listStudentAccounts().some((s) =>
      s.email?.toLowerCase() === data.email.trim().toLowerCase() ||
      (s.username || '').toLowerCase() === loginId.toLowerCase()
    );
    if (taken) { setError('This email or username is already used by another student.'); return; }
    saveMockEntity('student', {
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      username: (data.username || data.email.split('@')[0]).trim(),
      password: data.password,
      batch,
      branchId: campus?.id || '',
      branchName: campus?.name || '',
    });
    setLocation('/branch-admin/students');
  };
  return (
    <>
      <button onClick={() => setLocation('/branch-admin/students')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Back</button>
      <SectionTitle eyebrow="Branch Admin" title="Add a student" description={`They will appear under ${campus?.name || 'this campus'} in the chosen batch.`} />
      <form onSubmit={submit} className="card max-w-xl space-y-4 p-6">
        <label className="block text-sm font-semibold">Full name<input name="fullName" required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" /></label>
        <label className="block text-sm font-semibold">Login email
          <input name="email" type="email" required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">This is the student login ID.</span>
        </label>
        <label className="block text-sm font-semibold">Username
          <input name="username" className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" placeholder="Optional — they can also sign in with this" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input name="password" type="password" required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold">Confirm password
          <input name="confirmPassword" type="password" required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold">Batch
          <select value={batch} onChange={(e) => setBatch(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm">
            {batchOptions.length === 0 && <option value="">No batches yet</option>}
            {batchOptions.map((b) => <option key={b.id} value={b.name}>{b.name}{b.teacher ? ` · ${b.teacher}` : ''}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={!batchOptions.length}>Create student</Button>
      </form>
    </>
  );
}
export function AddBatchPage() {
  const [, setLocation] = useLocation();
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const teachers = campusTeachers(campus?.id);
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || '');
  const [subjects, setSubjects] = useState<string[]>(['Writing']);
  const [error, setError] = useState('');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const teacher = teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      setError('Select a teacher who already belongs to this campus. Add a teacher first if the list is empty.');
      return;
    }
    if (!subjects.length) {
      setError('Pick at least one subject this teacher will teach in the batch.');
      return;
    }
    saveMockEntity('batch', {
      name: data.name.trim(),
      schedule: data.schedule.trim(),
      teacherId: teacher.id,
      teacherName: teacher.name,
      subjects: subjects.join(' · '),
      branchId: campus?.id || '',
      branchName: campus?.name || '',
    });
    setLocation('/branch-admin/batches');
  };

  return (
    <>
      <button onClick={() => setLocation('/branch-admin/batches')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Back
      </button>
      <SectionTitle eyebrow="Branch Admin" title="Add a batch" description={`Pick one of the teachers already on ${campus?.name || 'this campus'}.`} />
      <form onSubmit={submit} className="card max-w-xl space-y-4 p-6">
        <label className="block text-sm font-semibold">Batch name
          <input name="name" required className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" placeholder="Morning Batch C" />
        </label>
        <label className="block text-sm font-semibold">Schedule
          <input name="schedule" required className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" placeholder="Mon · Wed · Fri" />
        </label>
        <label className="block text-sm font-semibold">Teacher
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            required
            className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
          >
            {teachers.length === 0 && <option value="">No teachers on this campus yet</option>}
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name} · {t.email}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Only teachers already added to this branch appear here.
          </span>
        </label>
        <div>
          <p className="text-sm font-semibold">Subjects this teacher will teach</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {['Writing', 'Reading', 'Listening', 'Speaking'].map((skill) => (
              <label key={skill} className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={subjects.includes(skill)}
                  onChange={() => setSubjects((prev) => prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill])}
                />
                {skill}
              </label>
            ))}
          </div>
        </div>
        {teachers.length === 0 && (
          <p className="text-sm text-amber-800">Add a teacher first, then you can assign them to a batch.</p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={teachers.length === 0}>Create batch</Button>
      </form>
    </>
  );
}

export function BranchBatchDetailPage({ batchId }: { batchId: string }) {
  const [, setLocation] = useLocation();
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const name = decodeURIComponent(batchId);
  const batch = listCampusBatches(campus?.id).find((b) => b.name === name || b.id === name);
  const rows = networkStudents(campus?.id).filter((s) => s.batch === (batch?.name || name));
  const teacher = batch?.teacherId ? getTeacherAccount(batch.teacherId) : listTeacherAccounts().find((t) => (t.fullName || t.name) === batch?.teacher);
  const teacherName = batch?.teacher || teacher?.fullName || teacher?.name || '';
  const teacherEmail = teacher?.email || '';
  const subjects = batch?.subjects || 'Writing · Reading · Listening · Speaking';

  return (
    <>
      <button onClick={() => setLocation('/branch-admin/batches')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Batches</button>
      <SectionTitle
        eyebrow="Batch"
        title={batch?.name || name}
        description={`${rows.length} learner${rows.length === 1 ? '' : 's'} on this timetable${batch?.schedule ? ` · ${batch.schedule}` : ''}.`}
      />
      <div className="mb-6 card p-5">
        <div className="eyebrow">Allotted teacher</div>
        {teacherName ? (
          <button
            type="button"
            className="mt-3 flex w-full items-center gap-3 text-left"
            onClick={() => teacher?.id && setLocation(`/branch-admin/teachers/${encodeURIComponent(teacher.id)}`)}
          >
            <Avatar initials={initialsFrom(teacherName)} size="sm" tone="amber" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{teacherName}</div>
              <div className="text-xs text-muted-foreground">{teacherEmail || 'Campus faculty'}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {subjects.split('·').map((s) => s.trim()).filter(Boolean).map((skill) => (
                  <Badge key={skill} tone="amber">{skill}</Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">This batch is allotted to {teacherName} for {subjects}.</p>
            </div>
            {teacher?.id && <ArrowUpRight size={14} className="text-muted-foreground" />}
          </button>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No teacher allotted to this batch yet.</p>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <div className="text-sm font-bold">Students in this batch</div>
          <p className="text-xs text-muted-foreground">Recent result is their latest estimated practice band.</p>
        </div>
        {rows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No students in this batch yet.</p>
        )}
        {rows.map((s) => {
          const report = studentWorkReport(s.id, s.batch);
          const recent = report.items.find((i) => i.status === 'Completed') || report.items[0];
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setLocation(`/branch-admin/students/${s.id}`)}
              className="flex w-full items-center gap-3 border-b border-border px-5 py-4 text-left last:border-0 hover:bg-muted/40"
            >
              <Avatar initials={s.initials} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{s.email}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Recent result · {recent ? `${recent.skill}: ${recent.title}` : 'No homework yet'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Band</div>
                <strong>{s.band > 0 ? s.band.toFixed(1) : '—'}</strong>
              </div>
              <ArrowUpRight size={14} className="shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BranchStudentDetailPage({ studentId }: { studentId: string }) {
  const [, setLocation] = useLocation();
  const campus = getCurrentBranchAdmin() || listBranches()[0];
  const listed = networkStudents(campus?.id).find((row) => row.id === studentId);
  const account = listed ? getStudentAccount(listed.id) : undefined;
  const seed = students.find((row) => row.id === studentId);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState(account?.fullName || listed?.name || '');
  const [email, setEmail] = useState(account?.email || listed?.email || '');
  const [username, setUsername] = useState(account?.username || (listed?.email || '').split('@')[0]);
  const [password, setPassword] = useState(account?.password || 'password123');
  const [confirmPassword, setConfirmPassword] = useState(account?.password || 'password123');

  if (!listed) {
    return (
      <div className="card p-8 text-center">
        <h2 className="font-display text-xl font-bold">Student not found.</h2>
        <Button className="mt-5" onClick={() => setLocation('/branch-admin/students')}>Back to students</Button>
      </div>
    );
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid login email.'); return; }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    const taken = listStudentAccounts().some((s) =>
      s.id !== listed.id && (s.email?.toLowerCase() === email.toLowerCase() || s.username?.toLowerCase() === username.toLowerCase())
    );
    if (taken) { setError('This email or username is already used by another student.'); return; }
    updateStudentAccount(listed.id, {
      fullName: fullName.trim(),
      name: fullName.trim(),
      email: email.trim(),
      username: username.trim(),
      password,
      batch: listed.batch,
      branchId: listed.branchId,
      branchName: listed.branchName,
    });
    setError('');
    setToast('Login saved. The student can sign in with this email or username and password.');
  };

  return (
    <>
      <button onClick={() => setLocation('/branch-admin/students')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Students</button>
      <SectionTitle
        eyebrow="Branch Admin"
        title={fullName || listed.name}
        description="Change this student’s login email (ID) and password, then share the new details with them."
      />
      <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
        <div className="card p-8 text-center">
          <Avatar initials={initialsFrom(fullName || listed.name)} size="lg" />
          <h2 className="mt-4 font-display text-xl font-bold">{fullName || listed.name}</h2>
          <p className="text-sm text-muted-foreground">{email}</p>
          {seed && <StatusBadge status={seed.status} />}
          <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
            <div><div className="text-muted-foreground">Batch</div><strong>{listed.batch}</strong></div>
            <div><div className="text-muted-foreground">Campus</div><strong>{listed.branchName}</strong></div>
            <div><div className="text-muted-foreground">Band</div><strong>{listed.band > 0 ? listed.band.toFixed(1) : '—'}</strong></div>
            <div><div className="text-muted-foreground">Last active</div><strong>{seed?.lastActive || '—'}</strong></div>
          </div>
          <button
            type="button"
            className="mt-6 h-11 w-full rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
            onClick={() => {
              if (!confirm(`Delete ${fullName || listed.name} from this branch?`)) return;
              removeStudentAccount(listed.id, listed.email);
              setLocation('/branch-admin/students');
            }}
          >
            Delete student
          </button>
        </div>
        <form onSubmit={save} className="card space-y-4 p-6">
          <div>
            <div className="eyebrow">Login credentials</div>
            <p className="mt-1 text-xs text-muted-foreground">Current ID and password are shown below. Change them anytime.</p>
          </div>
          <label className="block text-sm font-semibold">Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Login email (student ID)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Student signs in with this email.</span>
          </label>
          <label className="block text-sm font-semibold">Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Password
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Shown so you can share or change it. At least 6 characters.</span>
          </label>
          <label className="block text-sm font-semibold">Confirm password
            <input type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button type="submit">Save login</Button>
        </form>
      </div>
      {(() => {
        const report = studentWorkReport(listed.id, listed.batch);
        const skillIcon = (skill: string) => skill === 'Writing' ? <PencilLine size={16} /> : skill === 'Reading' ? <FileText size={16} /> : skill === 'Listening' ? <Headphones size={16} /> : <Users size={16} />;
        return (
          <div className="mt-6 space-y-4">
            <SectionTitle
              eyebrow="Activity report"
              title="Homework & practice"
              description="What this student was assigned, what they finished, and how the four skills look so far."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Homework assigned" value={String(report.assigned)} detail="From teachers on this campus" icon={<ClipboardCheck size={17} />} />
              <StatCard label="Completed" value={String(report.completed)} detail={`${report.completionPct}% of assigned`} icon={<Check size={17} />} accent="amber" />
              <StatCard label="Still open" value={String(report.pending + report.inProgress)} detail={`${report.inProgress} in progress · ${report.pending} pending`} icon={<FileText size={17} />} accent="blue" />
              <StatCard label="Practice sessions" value={String(report.practiceSessions)} detail="Self-practice this term" icon={<Target size={17} />} />
            </div>
            <div className="card p-6">
              <div className="eyebrow">Four skills</div>
              <h3 className="mt-1 font-display text-lg font-bold">Assigned vs completed</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {report.skills.map((row) => (
                  <div key={row.skill} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold">{skillIcon(row.skill)}{row.skill}</span>
                      <span className="text-xs text-muted-foreground">{row.completed}/{row.assigned} done</span>
                    </div>
                    <div className="mt-3"><ProgressBar value={row.assigned ? (row.completed / row.assigned) * 100 : 0} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <div className="eyebrow">Homework list</div>
                <h3 className="mt-1 font-display text-lg font-bold">Every assignment on this student</h3>
              </div>
              {report.items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.skill} · {item.teacher} · {item.due}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

export function TeacherBatchDetailPage({ batchId }: { batchId: string }) {
  const [, setLocation] = useLocation();
  const name = decodeURIComponent(batchId);
  const rows = listTeacherRoster().filter((s) => s.batch === name);
  return (
    <>
      <button onClick={() => setLocation('/teacher/batches')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Batches</button>
      <SectionTitle eyebrow="Your batch" title={name} description="Learners you teach in this cohort." action={<Button onClick={() => setLocation(`/teacher/batches/${encodeURIComponent(name)}/add-student`)}><Plus size={16} />Add student</Button>} />
      <div className="card overflow-hidden">
        {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No students in this batch yet.</p>}
        {rows.map((s) => (
          <button key={s.id} onClick={() => setLocation(`/teacher/students/${s.id}`)} className="flex w-full items-center gap-3 border-b border-border px-5 py-4 text-left last:border-0 hover:bg-muted/40">
            <Avatar initials={s.initials} size="sm" />
            <div className="flex-1">
              <div className="text-sm font-semibold">{s.name}</div>
              <div className="text-xs text-muted-foreground">ID {s.username || s.email.split('@')[0]}</div>
            </div>
            <strong>{s.band > 0 ? s.band.toFixed(1) : '—'}</strong>
          </button>
        ))}
      </div>
    </>
  );
}

export { TeacherStudentDetailPage } from '@/teacher/TeacherStudentDetail';

export function TeacherAddStudentPage({ batchId }: { batchId?: string }) {
  const [, setLocation] = useLocation();
  const decodedBatch = batchId ? decodeURIComponent(batchId) : '';
  const back = decodedBatch ? `/teacher/batches/${batchId}` : '/teacher/students';
  const batchOptions = Array.from(new Set([
    decodedBatch,
    ...listTeacherRoster().map((s) => s.batch),
    ...listCampusBatches('lahore').map((b) => b.name),
  ].filter(Boolean)));
  const [batch, setBatch] = useState(decodedBatch || batchOptions[0] || '');
  const [error, setError] = useState('');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const fullName = (data.fullName || '').trim();
    const loginId = (data.studentId || '').trim();
    if (fullName.length < 2) { setError('Enter the student name.'); return; }
    if (loginId.length < 3) { setError('Student ID must be at least 3 characters.'); return; }
    if ((data.password || '').length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (data.password !== data.confirmPassword) { setError('Passwords do not match.'); return; }
    if (!batch) { setError('Pick a batch for this student.'); return; }
    const taken = listStudentAccounts().some((s) =>
      (s.username || '').toLowerCase() === loginId.toLowerCase() ||
      (s.studentId || '').toLowerCase() === loginId.toLowerCase() ||
      (s.email || '').toLowerCase() === `${loginId.toLowerCase()}@student.fti.local`
    );
    if (taken) { setError('This student ID is already used.'); return; }
    saveMockEntity('student', {
      fullName,
      name: fullName,
      username: loginId,
      studentId: loginId,
      email: `${loginId.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@student.fti.local`,
      password: data.password,
      batch,
      branchId: 'lahore',
      branchName: 'Lahore Branch',
      band: '0',
      trend: '—',
      status: 'New',
      lastActive: 'Just added',
    });
    setLocation(back);
  };

  return (
    <>
      <button onClick={() => setLocation(back)} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Back
      </button>
      <SectionTitle
        eyebrow="Teacher workspace"
        title="Add a student"
        description="Write their name, student ID, and password here. Share those three details so they can sign in."
      />
      <form onSubmit={submit} className="card max-w-xl space-y-4 p-6">
        <label className="block text-sm font-semibold">Full name
          <input name="fullName" required autoComplete="name" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" placeholder="Ali Ahmad" />
        </label>
        <label className="block text-sm font-semibold">Student ID
          <input name="studentId" required minLength={3} autoComplete="username" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" placeholder="ali.ahmad" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">This is their login ID. They sign in with this, not an email.</span>
        </label>
        <label className="block text-sm font-semibold">Password
          <input name="password" type="text" required minLength={6} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" placeholder="At least 6 characters" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Shown in plain text so you can copy and give it to the student.</span>
        </label>
        <label className="block text-sm font-semibold">Confirm password
          <input name="confirmPassword" type="text" required minLength={6} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" />
        </label>
        <label className="block text-sm font-semibold">Batch
          <select value={batch} onChange={(e) => setBatch(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm">
            {batchOptions.length === 0 && <option value="">No batches yet</option>}
            {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={!batch}>Add student</Button>
      </form>
    </>
  );
}

export function Reports() {
  return (
    <>
      <SectionTitle eyebrow="Reports" title="Practice volume" description="Attempts and estimated average band across recent months." />
      <div className="card p-6">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={adminTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e0d4" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis domain={[5, 7]} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="band" stroke="#17665e" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

export function ReviewPage() {
  const [, setLocation] = useLocation();
  const [draft, setDraft] = useState<ReviewDraft>(() => getReviewDraft('1021'));
  const [toast, setToast] = useState('');
  return (
    <>
      <button onClick={() => setLocation('/teacher/reviews')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Review queue</button>
      <SectionTitle eyebrow="Teacher review" title="Public transport and congestion" description="Ali Ahmad · Morning Batch A · estimated practice bands stay separate from your mark." />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="card p-6">
          <div className="eyebrow">Student response</div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{reviewEssay}</p>
        </div>
        <div className="card p-6">
          <div className="eyebrow">Your mark</div>
          <label className="mt-4 block text-sm font-semibold">Overall band
            <input value={draft.overall} onChange={(e) => setDraft({ ...draft, overall: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="mt-4 block text-sm font-semibold">Feedback
            <textarea value={draft.feedback} onChange={(e) => setDraft({ ...draft, feedback: e.target.value })} className="mt-2 min-h-32 w-full rounded-lg border border-input p-3 text-sm" />
          </label>
          <div className="mt-5 flex gap-3">
            <Button variant="quiet" onClick={() => { saveReviewDraft(draft); setToast('Draft saved'); }}>Save draft</Button>
            <Button onClick={() => { publishReview(draft); setToast('Review published'); }}>Publish</Button>
          </div>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
