import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, ArrowLeft, ArrowUpRight, BarChart3, BookOpen, BrainCircuit, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, CheckCheck, ChevronDown, ClipboardCheck, Clock3, Eye, EyeOff, FileText, GraduationCap, Headphones, Image, Info, LayoutGrid, Library, LockKeyhole, LogOut, MapPin, Menu, Monitor, MoreHorizontal, NotebookPen, Paperclip, PencilLine, Plus, Save, Send, Settings, ShieldCheck, Sparkles, Target, Trash2, Users, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Avatar, Badge, Button, Countdown, Crumb, EmptyState, ProgressBar, SearchInput, SectionTitle, StatCard, StatusBadge, Toast } from '@/components/ui-kit';
import { assignments, branchPhoto, getCurrentBranchAdmin, getCurrentBranchAdminUser, getCurrentStudent, getCurrentSuperAdmin, getCurrentTeacher, getDraft, getPublishedReview, getReviewDraft, getRole, getStudentAccount, getWritingDraft, getWritingSession, listBranches, listStudentAccounts, listTeacherRoster, publishReview, reviewEssay, saveDraft, saveMockEntity, saveReviewDraft, saveWritingDraft, setCurrentBranchAdmin, setCurrentStudent, setCurrentTeacher, setPublishedReview, setRole, startWritingSession, student, students, subscribeSuperAdminSession, subscribeTeacherSession, submitHomework, submitPractice, trendData, updateStudentAccount, type Assignment, type AssignmentStatus, type ReviewDraft, type Role } from '@/lib/mock-api';
import { apiLogin, clearAuthSession } from '@/lib/auth-api';
import { hydrateOrgFromBackend } from '@/lib/hydrate-org';
import HomeworkComposer from '@/teacher/HomeworkComposer';
import HomeworkTeacherList from '@/teacher/HomeworkTeacherList';
import ReviewQueueLive from '@/teacher/ReviewQueueLive';
import StudentHomeworkList from '@/student/StudentHomeworkList';
import HomeworkDo from '@/student/HomeworkDo';
import PendingHomeworkPanel from '@/student/PendingHomeworkPanel';
import PracticeSetup from '@/student/PracticeSetup';
import IeltsTestsHub from '@/student/IeltsTestsHub';
import AuthHero from '@/components/AuthHero';
import { Logo } from '@/components/brand';
import TeacherStudentsList from '@/teacher/TeacherStudentsList';
import TeacherNotes from '@/teacher/TeacherNotes';
import TeacherSettings from '@/teacher/TeacherSettings';
import SuperAdminSettings from '@/admin/SuperAdminSettings';
import StudentNotes from '@/student/StudentNotes';
import StudentNoteReader from '@/student/StudentNoteReader';
import NotificationBell from '@/components/NotificationBell';
import UpcomingMockCard from '@/student/mocks/UpcomingMockCard';
import MockExamsHub from '@/student/mocks/MockExamsHub';
import MockBriefing from '@/student/mocks/MockBriefing';
import MockRoom from '@/student/mocks/MockRoom';
import AssignMock from '@/teacher/mocks/AssignMock';
import { AssignedMocksPage, LiveMonitoringPage, MockLibraryPage, MockResultsPage } from '@/teacher/mocks/MockExamsPages';
import {
  AddBatchPage, AddBranchPage, AddPracticePaperPage, AddStudentPage, AddTeacherPage, EditTeacherPage,
  AdminDashboard, AdminTablePage, BranchAdminDashboard, BranchAdminSettingsPage, BranchAdminTablePage,
  BranchBatchDetailPage, BranchDetailPage, BranchStudentDetailPage, Reports, ReviewPage,
  TeacherAddStudentPage, TeacherBatchDetailPage, TeacherStudentDetailPage,
} from '@/admin/workspace';

const queryClient = new QueryClient();

function initialsFromName(name: string) {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'BA';
}

const overviewNav = (href: string) => ({ label: 'Overview', href, icon: <LayoutGrid size={17} /> });

const navByRole: Record<Role, { label:string; href:string; icon:ReactNode; children?: {label:string; href:string}[] }[]> = {
  student: [
    overviewNav('/student/dashboard'),
    {label:'Homework',href:'/student/homework',icon:<ClipboardCheck size={17}/>},
    {label:'Notes',href:'/student/notes',icon:<NotebookPen size={17}/>},
    {label:'IELTS Practice',href:'/student/practice',icon:<PencilLine size={17}/>},
    {label:'Results',href:'/student/results',icon:<BarChart3 size={17}/>},
    {label:'History',href:'/student/history',icon:<Archive size={17}/>},
    {label:'Mock Tests',href:'/student/mocks',icon:<Monitor size={17}/>},
  ],
  teacher: [
    overviewNav('/teacher/dashboard'),
    {label:'Batches',href:'/teacher/batches',icon:<Users size={17}/>},
    {label:'Students',href:'/teacher/students',icon:<GraduationCap size={17}/>},
    {label:'Homework',href:'/teacher/homework',icon:<ClipboardCheck size={17}/>},
    {label:'Reviews',href:'/teacher/reviews',icon:<FileText size={17}/>},
    {label:'Notes',href:'/teacher/notes',icon:<NotebookPen size={17}/>},
    {
      label:'Mock Exams',
      href:'/teacher/mocks',
      icon:<Monitor size={17}/>,
      children: [
        {label:'Library', href:'/teacher/mocks'},
        {label:'Assign mock', href:'/teacher/mocks/assign'},
        {label:'Assigned', href:'/teacher/mocks/assigned'},
        {label:'Live monitoring', href:'/teacher/mocks/live'},
        {label:'Results', href:'/teacher/mocks/results'},
      ],
    },
  ],
  admin: [
    overviewNav('/admin/dashboard'),
    {label:'Branches',href:'/admin/branches',icon:<Library size={17}/>},
    {label:'Branch admins',href:'/admin/branch-admins',icon:<ShieldCheck size={17}/>},
    {label:'Teachers',href:'/admin/teachers',icon:<BriefcaseBusiness size={17}/>},
    {label:'Students',href:'/admin/students',icon:<GraduationCap size={17}/>},
    {label:'Reports',href:'/admin/reports',icon:<BarChart3 size={17}/>},
  ],
  'branch-admin': [
    overviewNav('/branch-admin/dashboard'),
    {label:'Teachers',href:'/branch-admin/teachers',icon:<BriefcaseBusiness size={17}/>},
    {label:'Students',href:'/branch-admin/students',icon:<GraduationCap size={17}/>},
    {label:'Batches',href:'/branch-admin/batches',icon:<Users size={17}/>},
    {label:'Reports',href:'/branch-admin/reports',icon:<Target size={17}/>},
  ],
};

function Shell({ role, children }: {role:Role; children:ReactNode}) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [teacher, setTeacher] = useState(getCurrentTeacher);
  const [superAdmin, setSuperAdmin] = useState(getCurrentSuperAdmin);
  useEffect(() => subscribeTeacherSession(() => setTeacher(getCurrentTeacher())), []);
  useEffect(() => subscribeSuperAdminSession(() => setSuperAdmin(getCurrentSuperAdmin())), []);
  const nav = navByRole[role];
  const roleName = role === 'admin' ? 'Super Admin' : role === 'branch-admin' ? 'Branch Admin' : role === 'teacher' ? 'Teacher workspace' : 'Student workspace';
  const settingsHref = role === 'student' ? '/student/profile' : role === 'admin' ? '/admin/settings' : role === 'teacher' ? '/teacher/settings' : '/branch-admin/settings';
  const branchAdmin = role === 'branch-admin' ? getCurrentBranchAdmin() : null;
  const branchAdminUser = role === 'branch-admin' ? getCurrentBranchAdminUser() : null;
  const teacherName = teacher.fullName || teacher.name || 'Teacher';
  const superAdminName = superAdmin.fullName || superAdmin.name || 'Super Admin';
  const studentName = getCurrentStudent().name || 'Student';
  const headerName = role==='student'?studentName:role==='teacher'?teacherName:role==='admin'?superAdminName:(branchAdminUser?.name || branchAdmin?.admin || 'Branch Admin');
  const headerInitials = role==='student'?initialsFromName(studentName):role==='teacher'?initialsFromName(teacherName):role==='admin'?initialsFromName(superAdminName):initialsFromName(headerName);
  const focusMode = location.startsWith('/student/practice') || location.startsWith('/student/mock-attempt') || /^\/student\/homework\/.+\/do$/.test(location) || /^\/student\/notes\/[^/]+$/.test(location);
  if (focusMode) {
    return <div className="min-h-dvh bg-[#f4f1eb]">{children}</div>;
  }
  return <div className="app-shell">
    <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex h-dvh w-[252px] -translate-x-full flex-col overflow-hidden p-5 transition-transform md:translate-x-0 ${mobileOpen?'translate-x-0':''}`}>
      <div className="mb-8 flex shrink-0 items-center justify-between"><Logo dark/><button className="text-white/60 md:hidden" onClick={()=>setMobileOpen(false)} aria-label="Close menu"><X size={20}/></button></div>
      <div className="mb-3 shrink-0 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">{roleName}</div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{nav.map(item=>{
        const isChildActive = (href: string) =>
          href === item.href
            ? location === href
            : location === href || location.startsWith(href + '/');
        const childActive = item.children?.some((c) => isChildActive(c.href));
        const routeOpen = Boolean(
          item.children && (location === item.href || location.startsWith(item.href + '/') || childActive),
        );
        const isOpen = openMenus[item.href] ?? Boolean(routeOpen);
        const parentActive = item.label === 'Overview'
          ? location === item.href
          : location === item.href || Boolean(childActive) || (item.href !== '/' && location.startsWith(item.href + '/'));
        const hasChildren = Boolean(item.children?.length);
        return (
          <div key={item.href}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => {
                  setOpenMenus((prev) => ({ ...prev, [item.href]: !isOpen }));
                  if (!isOpen) setLocation(item.href);
                  setMobileOpen(false);
                }}
                className={`nav-link flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${parentActive?'active':''}`}
                data-testid={`link-${item.label.toLowerCase().replaceAll(' ','-')}`}
                aria-expanded={isOpen}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <ChevronDown size={16} className={`shrink-0 opacity-70 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <Link href={item.href} onClick={()=>setMobileOpen(false)} className={`nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${parentActive?'active':''}`} data-testid={`link-${item.label.toLowerCase().replaceAll(' ','-')}`}>{item.icon}<span>{item.label}</span>{item.label==='Reviews' && <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">12</span>}</Link>
            )}
            {hasChildren && isOpen && (
              <div className="mb-1 ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                {item.children!.map((child) => (
                  <Link key={`${child.href}-${child.label}`} href={child.href} onClick={()=>setMobileOpen(false)} className={`nav-link block rounded-lg px-3 py-2 text-sm font-medium ${isChildActive(child.href)?'active':''}`}>{child.label}</Link>
                ))}
              </div>
            )}
          </div>
        );
      })}</nav>
      <div className="mt-4 shrink-0 border-t border-white/10 pt-4">
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-white/35">Account</div>
        <Link href={settingsHref} data-testid="link-settings" className={`nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${location===settingsHref?'active':''}`}><Settings size={17}/>Settings</Link>
        <Link href="/" onClick={()=>{ clearAuthSession(); setRole('student'); localStorage.removeItem('ielts-current-teacher-id'); localStorage.removeItem('ielts-current-student'); }} className="nav-link mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"><LogOut size={17}/>Sign out</Link>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <Avatar initials={headerInitials} size="sm" tone="amber"/>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-white" data-testid="sidebar-user-name">{headerName}</div>
              <div className="truncate text-[10px] text-white/45">{roleName}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
    {mobileOpen && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-slate-900/30 md:hidden" onClick={()=>setMobileOpen(false)}/>}
     <main className="min-w-0 flex-1 md:ml-[252px]"><header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur md:px-8"><div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-muted md:hidden" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="md:hidden"><Logo/></div>{role === 'student' && <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span>June 12, 2025</span><span className="h-1 w-1 rounded-full bg-amber-400"/><span>{roleName}</span></div>}</div><div className="flex items-center gap-3">{role==='student' && <NotificationBell/>}<Avatar initials={headerInitials} size="sm" tone={role === 'student' ? 'amber' : 'teal'}/><button type="button" onClick={()=>{ if(role==='branch-admin') setLocation('/branch-admin/settings'); if(role==='teacher') setLocation('/teacher/settings'); if(role==='admin') setLocation('/admin/settings'); }} className="hidden text-left text-xs sm:block"><div className="font-semibold" data-testid="header-user-name">{headerName}</div><div className="text-muted-foreground">{roleName}</div></button></div></header><div className="mx-auto max-w-[1480px] p-5 md:p-8">{children}</div></main>
  </div>;
}

function BranchSelection() {
  const [, setLocation] = useLocation();
  const branches = listBranches();

  return (
    <div className="auth-split bg-[#f4efe7]">
      <AuthHero
        eyebrow="FTI Consultants · IELTS academy"
        title="Train for the band"
        accent="you actually want."
        text="One workspace for FTI students, teachers and campus admins. Live banks on lab computers, teacher homework, and estimated AI feedback — across Pakistan."
      />
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:h-full lg:overflow-y-auto lg:px-10 lg:py-7 xl:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(232,141,47,.16),transparent_38%)]" />
        <div className="pointer-events-none absolute -left-24 bottom-10 hidden h-56 w-56 rounded-full bg-amber-200/30 blur-3xl sm:block" />
        <div className="relative mx-auto flex w-full min-w-0 max-w-[840px] flex-col lg:h-full lg:flex-1">
          <div className="mb-3 shrink-0 fade-up sm:mb-5">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 sm:mb-3">
              Select your branch
            </div>
            <h2 className="font-display text-[1.45rem] font-bold tracking-tight text-slate-900 sm:text-[2.15rem]">
              Choose your campus.
            </h2>
            <p className="mt-1.5 max-w-lg text-[13px] leading-5 text-slate-500 sm:mt-2 sm:text-sm sm:leading-6">
              Six FTI centres across Pakistan. Pick yours to open the student, teacher or admin workspace.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 content-start gap-2.5 sm:gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-3 lg:content-stretch lg:gap-3.5">
            {branches.map((branch, index) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setLocation('/login')}
                style={{ animationDelay: `${index * 55}ms` }}
                className="campus-card group flex min-h-[7.5rem] min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/80 bg-white text-left shadow-[0_10px_30px_rgba(40,28,12,.06)] transition duration-300 hover:border-amber-300 hover:shadow-[0_18px_40px_rgba(196,92,18,.14)] sm:min-h-0 sm:rounded-[22px] lg:h-full lg:min-h-0 lg:hover:-translate-y-1"
              >
                <div className="relative h-[4.25rem] overflow-hidden sm:h-28 lg:h-auto lg:min-h-[5.5rem] lg:flex-1">
                  <img src={branchPhoto(branch)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                  <span className="absolute bottom-1.5 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 backdrop-blur sm:bottom-2 sm:left-3">
                    <MapPin size={11} className="shrink-0 text-amber-700" />
                    <span className="truncate">{branch.city}</span>
                  </span>
                </div>
                <div className="flex min-h-11 shrink-0 items-center justify-between gap-1.5 px-2.5 py-2 sm:items-end sm:px-3.5 sm:py-3">
                  <div className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight text-slate-900 sm:truncate sm:text-sm">{branch.name}</span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-slate-500 sm:truncate sm:text-[11px]">{branch.students} learners · FTI campus</span>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition group-hover:bg-amber-500 group-hover:text-white">
                    <ArrowUpRight size={15} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 shrink-0 fade-up-2 sm:mt-4">
            <button
              type="button"
              onClick={() => setLocation('/super-admin-login')}
              className="group flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-[18px] bg-[linear-gradient(135deg,#171410_0%,#2a2218_58%,#3a2a12_100%)] p-3.5 text-left text-white shadow-[0_16px_40px_rgba(23,16,10,.22)] transition hover:brightness-110 sm:min-h-16 sm:rounded-[22px] sm:p-4"
            >
              <div className="min-w-0">
                <span className="block text-sm font-semibold">Super Admin Login</span>
                <span className="mt-0.5 block text-xs text-white/55">Network-wide control for all branches</span>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300 transition group-hover:bg-amber-400 group-hover:text-slate-950">
                <ShieldCheck size={18} />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuperAdminLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || password.length < 6) {
      setError('Enter a valid username and a password of at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user } = await apiLogin(username, password, 'super_admin');
      if (user.role !== 'super_admin') throw new Error('Not a super admin account.');
      await hydrateOrgFromBackend(user);
      setRole('admin');
      setLocation('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="auth-split auth-split-login bg-[#f6f3ee]">
      <AuthHero
        eyebrow="FTI network · Super Admin"
        title="One view of"
        accent="every FTI campus."
        text="See branches, admins and academy-wide progress from one desk. Same LMS your students and teachers already use."
      />
      <div className="flex min-h-0 min-w-0 items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-10 lg:h-full lg:items-center lg:px-10">
        <div className="w-full max-w-[430px] fade-up">
          <div className="mb-8">
            <button onClick={() => setLocation('/')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16}/>Back to Branch Selection
            </button>
            <div className="eyebrow mb-3 text-blue-600">Global Administration</div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Super Admin Login</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to manage the FTI IELTS network.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="username">Username</label>
              <input id="username" type="text" value={username} onChange={e=>setUsername(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-4 text-sm focus:ring-2 focus:ring-ring"/>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="password">Password</label>
              <div className="relative">
                <LockKeyhole size={16} className="absolute left-4 top-4 text-muted-foreground"/>
                <input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card pl-11 pr-4 text-sm focus:ring-2 focus:ring-ring"/>
              </div>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="h-12 w-full bg-blue-600 hover:bg-blue-700">
              {loading ? 'Authenticating…' : 'Sign in as Super Admin'} {!loading && <ShieldCheck size={17}/>}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function BranchAdminLogin() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || password.length < 6) {
      setError('Enter a valid username and a password of at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { user } = await apiLogin(username, password, 'branch_admin');
      if (user.role !== 'branch_admin') throw new Error('Not a branch admin account.');
      await hydrateOrgFromBackend(user);
      setCurrentBranchAdmin(user.branch_id || user.branchId || '', user.username);
      setRole('branch-admin');
      setLocation('/branch-admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-split auth-split-login bg-[#f6f3ee]">
      <AuthHero
        eyebrow="FTI campus · Branch admin"
        title="Run your campus"
        accent="from one desk."
        text="Teachers, batches and student progress for your FTI centre. Four IELTS skills, one workspace."
      />
      <div className="flex min-h-0 min-w-0 items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-10 lg:h-full lg:items-center lg:px-10">
        <div className="w-full max-w-[430px] fade-up">
          <div className="mb-8">
            <button onClick={() => setLocation('/login')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16}/>Back to General Login
            </button>
            <div className="eyebrow mb-3 text-teal-600">Local Administration</div>
            <h2 className="font-display text-3xl font-bold tracking-tight">Branch Admin Login</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your branch.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="username">Username</label>
              <input id="username" type="text" value={username} onChange={e=>setUsername(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-4 text-sm focus:ring-2 focus:ring-ring"/>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold" htmlFor="password">Password</label>
              <div className="relative">
                <LockKeyhole size={16} className="absolute left-4 top-4 text-muted-foreground"/>
                <input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card pl-11 pr-4 text-sm focus:ring-2 focus:ring-ring"/>
              </div>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="h-12 w-full bg-teal-600 hover:bg-teal-700">
              {loading ? 'Authenticating…' : 'Sign in as Branch Admin'} {!loading && <ShieldCheck size={17}/>}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const [, setLocation] = useLocation();
  const [role, setLoginRole] = useState<Role>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const roles: {id:Role | 'branch-admin-link'; label:string; desc:string; initials:string}[] = [{id:'student',label:'Student',desc:'Practice, submit, improve',initials:'ST'},{id:'teacher',label:'Teacher',desc:'Review and guide learners',initials:'TR'},{id:'branch-admin-link',label:'Branch Admin',desc:'Manage your branch',initials:'BA'}];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'branch-admin-link' as Role) return;
    if (password.length < 6) { setError('Enter a password of at least 6 characters.'); return; }
    setError('');
    setLoading(true);
    try {
      const hint = role === 'teacher' ? 'teacher' : 'student';
      const { user } = await apiLogin(email, password, hint);
      await hydrateOrgFromBackend(user);
      if (user.role === 'teacher') {
        setCurrentTeacher(user.id);
        setRole('teacher');
        setLocation('/teacher/dashboard');
        return;
      }
      if (user.role !== 'student') throw new Error('Use the correct login page for this account.');
      setCurrentStudent({
        id: user.id,
        name: user.full_name || user.name || user.username,
        batch: user.batch || '',
        email: user.email,
        username: user.username,
      });
      localStorage.setItem('writing_student_id', user.id);
      setRole('student');
      setLocation('/student/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  return <div className="auth-split auth-split-login bg-[#f6f3ee]"><AuthHero eyebrow="FTI IELTS · Welcome back" title="Make every" accent="word count." text="Sign in to practise Writing, Reading, Listening and Speaking. Submit homework, sit mocks, and get estimated AI feedback before class."/><div className="flex min-h-0 min-w-0 items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-10 lg:h-full lg:items-center lg:px-10"><div className="w-full max-w-[430px] fade-up"><div className="mb-8"><div className="eyebrow mb-3">Welcome back</div><h2 className="font-display text-[1.7rem] font-bold tracking-tight sm:text-3xl">Your next band is<br/>closer than you think.</h2><p className="mt-2 text-sm text-muted-foreground">Sign in to continue your writing practice.</p></div><form onSubmit={submit} className="space-y-5"><div><label className="mb-2 block text-sm font-semibold" htmlFor="email">{role==='teacher'?'Email or username':'Email or username'}</label><input id="email" data-testid="input-email" type="text" value={email} onChange={e=>setEmail(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card px-4 text-sm focus:ring-2 focus:ring-ring"/></div><div><div className="mb-2 flex justify-between"><label className="text-sm font-semibold" htmlFor="password">Password</label><button type="button" className="text-xs font-semibold text-primary hover:underline">Forgot password?</button></div><div className="relative"><LockKeyhole size={16} className="absolute left-4 top-4 text-muted-foreground"/><input id="password" data-testid="input-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 w-full rounded-lg border border-input bg-card pl-11 pr-4 text-sm focus:ring-2 focus:ring-ring"/></div></div>{error && <p className="text-sm text-red-700">{error}</p>}<Button type="submit" className="h-12 w-full">{loading?'Opening workspace…':'Sign in'} {!loading && <ArrowUpRight size={17}/>}</Button></form><div className="my-8 flex items-center gap-3"><div className="h-px flex-1 bg-border"/><span className="text-[11px] uppercase tracking-widest text-muted-foreground">Demo access</span><div className="h-px flex-1 bg-border"/></div><div className="space-y-2">{roles.map(item=><button key={item.id} type="button" data-testid={`button-demo-${item.id}`} onClick={()=>{if(item.id==='branch-admin-link'){setLocation('/branch-admin-login');}else{setLoginRole(item.id as Role);setEmail(item.id==='student'?'ali.ahmad@example.com':'nadia.rahman@example.com')}}} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${role===item.id?'border-primary bg-teal-50/60':'border-border bg-card hover:bg-muted'}`}><Avatar initials={item.initials} size="sm" tone={item.id==='branch-admin-link'?'teal':item.id==='teacher'?'amber':'teal'}/><span className="flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="block text-xs text-muted-foreground">{item.desc}</span></span>{role===item.id && <Check size={16} className="text-primary" />}</button>)}</div><p className="mt-8 text-center text-xs text-muted-foreground">Demo mode is enabled. Choose a workspace above to explore.</p></div></div></div>;
}

function StudentDashboard() {
  const [, setLocation] = useLocation();
  const openHomework = assignments.filter((a) => a.status !== 'Completed').length;
  return (
    <>
      <SectionTitle
        eyebrow="Thursday · June 12, 2025"
        title={`Good morning, ${student.name.split(' ')[0]}.`}
        description="A small, focused session today keeps your target band in sight."
        action={<Button onClick={() => setLocation('/student/practice')}><PencilLine size={16} />Start practice</Button>}
      />
      <div className="mb-7 flex flex-wrap items-center gap-3 text-xs">
        <Badge tone="teal">{student.track}</Badge>
        <span className="text-muted-foreground">{student.batch}</span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">Target band <strong className="text-foreground">7.0</strong></span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 fade-up">
        <StatCard label="Current band" value="6.5" detail="+0.5 since February" icon={<Target size={17} />} />
        <StatCard label="Open homework" value={String(openHomework)} detail="Assigned by your teacher" icon={<ClipboardCheck size={17} />} accent="amber" />
        <StatCard label="Practice streak" value="6 days" detail="Keep it going" icon={<Sparkles size={17} />} accent="amber" />
        <StatCard label="Target band" value="7.0" detail="0.5 to go" icon={<BarChart3 size={17} />} accent="blue" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <div className="card p-6 fade-up-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="eyebrow">Your trajectory</div>
              <h2 className="font-display mt-1 text-lg font-bold">Band trend</h2>
            </div>
            <Badge tone="green">+0.5 overall</Badge>
          </div>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="bandFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#e2a24b" stopOpacity=".35" />
                    <stop offset="100%" stopColor="#e2a24b" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e0d4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8b8b85' }} />
                <YAxis domain={[5, 7]} ticks={[5, 5.5, 6, 6.5, 7]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#8b8b85' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e6e0d4', fontSize: 12 }} />
                <Area type="monotone" dataKey="band" stroke="#e2a24b" strokeWidth={3} fill="url(#bandFill)" dot={{ fill: '#e2a24b', r: 4, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card overflow-hidden fade-up-3">
          <div className="border-b border-border p-6">
            <div className="eyebrow">Latest result</div>
            <div className="mt-3 flex items-end justify-between">
              <div className="metric-number text-5xl font-bold">6.5</div>
              <Badge tone="green">Teacher-reviewed</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Technology in the workplace · Jun 9</p>
          </div>
          <div className="p-6">
            <Link href="/student/results" className="flex items-center justify-between text-xs font-bold text-primary">View detailed result <ArrowUpRight size={15} /></Link>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="eyebrow">Next up</div>
              <h2 className="font-display mt-1 text-lg font-bold">Pending homework</h2>
            </div>
            <Link href="/student/homework" className="text-xs font-bold text-primary">View all</Link>
          </div>
          <PendingHomeworkPanel />
        </div>
      </div>
      <div className="mt-6">
        <UpcomingMockCard />
      </div>
    </>
  );
}

function AssignmentRow({ assignment, onClick }: {assignment:Assignment; onClick:()=>void}) {
  return <button onClick={onClick} data-testid={`button-assignment-${assignment.id}`} className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${assignment.task==='Task 1'?'bg-sky-50 text-sky-700':'bg-amber-50 text-amber-700'}`}>{assignment.task.replace('Task ','T')}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{assignment.title}</div><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>{assignment.task}</span><span>·</span><span>{assignment.dueLabel}</span></div></div><StatusBadge status={assignment.status}/><ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-primary"/></button>;
}

function HomeworkPage() {
  return <StudentHomeworkList/>;
}

function AssignmentDetail() {
  const [,setLocation] = useLocation(); const assignment=assignments[0];
  return <><Crumb text="Homework · Assignment 08"/><div className="mx-auto max-w-4xl"><button onClick={()=>setLocation('/student/homework')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16}/>Back to homework</button><div className="card overflow-hidden"><div className="border-b border-border bg-[hsl(var(--sidebar))] p-6 text-white sm:p-9"><div className="flex flex-wrap items-center gap-2"><Badge tone="amber">Academic · Task 2</Badge><span className="text-xs text-white/45">Assignment 08</span></div><h1 className="mt-5 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">{assignment.title}</h1><div className="mt-5 flex items-center gap-3 text-sm text-white/65"><Avatar initials="NR" size="sm" tone="amber"/><span>Assigned by <strong className="text-white">Nadia Rahman</strong> · {assignment.batch}</span></div></div><div className="p-6 sm:p-9"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Deadline</div><div className="mt-1 text-sm font-bold">Jun 14, 2025</div><div className="mt-1 text-xs text-amber-700">{assignment.dueLabel}</div></div><div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Suggested timing</div><div className="mt-1 text-sm font-bold">{assignment.duration} minutes</div></div><div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Minimum words</div><div className="mt-1 text-sm font-bold">{assignment.words} words</div></div><div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Status</div><div className="mt-2"><StatusBadge status={assignment.status}/></div></div></div><div className="mt-8"><div className="eyebrow">Your question</div><blockquote className="mt-3 border-l-2 border-amber-400 pl-5 text-base font-medium leading-8 text-foreground sm:text-lg">“{assignment.question}”</blockquote></div><div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/70 p-5"><div className="flex gap-3"><Sparkles size={19} className="mt-0.5 shrink-0 text-amber-700"/><div><div className="text-sm font-bold text-amber-900">A note from Nadia</div><p className="mt-1 text-sm leading-6 text-amber-900/70">Plan your position before you write. Use one clear example in each body paragraph and leave five minutes to proofread.</p></div></div></div><div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Your work is autosaved while you write.</p><Button onClick={()=>setLocation('/student/homework/08/write')} className="sm:px-7">Start writing <ArrowUpRight size={16}/></Button></div></div></div></div></>;
}

function Writer({ practice=false }: {practice?:boolean}) {
  const [,setLocation] = useLocation(); const [text,setText] = useState(getDraft()); const [seconds,setSeconds] = useState(40*60); const [saved,setSaved] = useState(true); const [submitted,setSubmitted] = useState(false); const [confirm,setConfirm] = useState(false);
  useEffect(()=>{const id=setInterval(()=>setSeconds(s=>s>0?s-1:s),1000);return()=>clearInterval(id)},[]);
  const words = text.trim()?text.trim().split(/\s+/).length:0;
  const onChange=(value:string)=>{setText(value);setSaved(false);window.setTimeout(()=>{saveDraft(value);setSaved(true)},500)};
  if(submitted) return <div className="mx-auto max-w-2xl py-12 text-center fade-up"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={30}/></div><div className="eyebrow mt-7 !text-emerald-700">Submission received</div><h1 className="mt-2 font-display text-3xl font-bold">Your writing is with Nadia.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">This essay has been submitted successfully and is now <strong className="text-foreground">Awaiting Teacher Review</strong>. You’ll be notified when feedback is ready.</p><div className="card mx-auto mt-8 max-w-sm p-5 text-left"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Words written</span><strong>{words}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-muted-foreground">Submitted</span><strong>Just now</strong></div><div className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">No AI score is shown for homework submissions.</div></div><div className="mt-7 flex justify-center gap-3"><Button variant="quiet" onClick={()=>setLocation('/student/homework')}>Back to homework</Button><Button onClick={()=>setLocation('/student/dashboard')}>Go to overview</Button></div></div>;
  return <div className="mx-auto max-w-6xl"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><button onClick={()=>setLocation(practice?'/student/practice':'/student/homework/08')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16}/>Exit writing room</button><div className="flex items-center gap-3"><span className={`hidden text-xs sm:block ${saved?'text-muted-foreground':'text-amber-700'}`}>{saved?'Saved locally':'Saving…'}</span><Countdown seconds={seconds}/></div></div><div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]"><div className="card h-fit p-6 lg:sticky lg:top-[90px]"><div className="eyebrow">Question · Academic Task 2</div><h1 className="mt-3 font-display text-xl font-bold leading-7">Some people believe that the best way to reduce traffic congestion is to make public transport free.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">To what extent do you agree or disagree?</p><div className="mt-6 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-muted p-3"><div className="text-muted-foreground">Minimum</div><strong className="mt-1 block">250 words</strong></div><div className="rounded-lg bg-muted p-3"><div className="text-muted-foreground">Time left</div><strong className="mt-1 block text-amber-700">{Math.floor(seconds/60)} min</strong></div></div><div className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground"><div className="flex gap-2"><LockKeyhole size={14} className="mt-0.5 shrink-0"/>Copy and paste are disabled in this writing room. Focus on your own words.</div></div></div><div className="card overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="font-display text-base font-bold">Your response</div><div className="mt-1 text-xs text-muted-foreground">Take a breath. Make your position clear.</div></div><div className="text-right"><div className="metric-number text-xl font-bold">{words}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">words</div></div></div><textarea data-testid="textarea-writing" value={text} onChange={e=>onChange(e.target.value)} onCopy={e=>e.preventDefault()} onPaste={e=>e.preventDefault()} spellCheck className="min-h-[520px] w-full resize-y border-0 bg-transparent p-6 text-[15px] leading-8 outline-none placeholder:text-muted-foreground/50 focus:ring-0" placeholder="Begin writing your response here…"/><div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-muted-foreground">{words<250?'Aim for at least 250 words.':'Good length. Leave time to proofread.'}</div><Button onClick={()=>setConfirm(true)} disabled={words<5}>Submit response <ArrowUpRight size={16}/></Button></div></div></div>{confirm&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-5"><div className="card w-full max-w-md p-6"><div className="flex items-start justify-between"><div><div className="eyebrow">Ready to submit?</div><h2 className="mt-2 font-display text-xl font-bold">Send this response to Nadia?</h2></div><button onClick={()=>setConfirm(false)} aria-label="Close confirmation"><X size={18}/></button></div><p className="mt-3 text-sm leading-6 text-muted-foreground">You have written {words} words. After submitting, you won’t be able to edit this response. It will be marked Awaiting Teacher Review.</p><div className="mt-6 flex justify-end gap-3"><Button variant="quiet" onClick={()=>setConfirm(false)}>Keep writing</Button><Button onClick={()=>{setConfirm(false);setSubmitted(true)}}>Submit now</Button></div></div></div>}</div>;
}

function PracticePage({ skill }: { skill?: string }) {
  if (!skill) return <IeltsTestsHub />;
  const module = skill.charAt(0).toUpperCase() + skill.slice(1);
  return <PracticeSetup initialModule={module} />;
}
function StudentSupporting({ page }: {page:string}) {
  const [toast,setToast]=useState(''); const [query,setQuery]=useState('');
  const configs: Record<string,{eyebrow:string;title:string;desc:string}> = {results:{eyebrow:'Feedback you can use',title:'Results',desc:'Teacher feedback and practice estimates, kept clearly separate.'},history:{eyebrow:'Your writing archive',title:'Writing history',desc:'A record of every response, revision, and review.'},profile:{eyebrow:'Your account',title:'Profile',desc:'View your learner details and update your username or password.'}};
  const c=configs[page]||configs.results;
  return <><SectionTitle eyebrow={c.eyebrow} title={c.title} description={c.desc}/>{page==='results'?<ResultsContent/>:page==='history'?<HistoryContent query={query} setQuery={setQuery}/>:<Profile onToast={setToast}/>} {toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</>;
}
function ResultsContent(){ const published=getPublishedReview(); return <div className="space-y-6"><div><div className="mb-3 flex items-center gap-2"><div className="eyebrow">Teacher-reviewed</div><Badge tone="green">{published?'Published':'Reviewed Jun 9'}</Badge></div><div className="card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-display text-lg font-bold">Technology in the workplace</h2><p className="mt-1 text-xs text-muted-foreground">Task 2 · Submitted Jun 7 · Nadia Rahman</p></div><div className="metric-number text-4xl font-bold">6.5</div></div><div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">{[['Task response','7.0'],['Coherence','6.5'],['Lexical resource','6.0'],['Grammar','6.5']].map(([a,b])=><div key={a}><div className="text-xs text-muted-foreground">{a}</div><div className="mt-1 font-display text-xl font-bold">{b}</div></div>)}</div><div className="mt-6 border-t border-border pt-4"><div className="eyebrow">Nadia’s feedback</div><p className="mt-2 text-sm leading-6 text-muted-foreground">Clear position and a logical structure. To move towards band 7, make your supporting examples more specific and watch article use in longer sentences.</p></div></div></div><div><div className="mb-3 flex items-center gap-2"><div className="eyebrow">AI estimated</div><Badge tone="blue">Practice only</Badge></div><div className="card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Globalisation and local culture</h2><p className="mt-1 text-xs text-muted-foreground">Practice mode · Jun 5</p></div><div className="metric-number text-4xl font-bold text-sky-700">6.0</div></div><p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">AI estimates are directional practice feedback and are not teacher results.</p></div></div></div>; }
function HistoryContent({query,setQuery}:{query:string;setQuery:(v:string)=>void}){ const rows=assignments.filter(a=>a.title.toLowerCase().includes(query.toLowerCase())); return <><div className="mb-4"><SearchInput value={query} onChange={setQuery} placeholder="Search your writing"/></div><div className="card overflow-hidden"><div className="mobile-scroll"><div className="min-w-[680px]"><div className="grid grid-cols-[1.4fr_.6fr_.7fr_.7fr] gap-4 bg-muted/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span>Response</span><span>Type</span><span>Status</span><span>Date</span></div>{rows.map(a=><div key={a.id} className="data-row grid grid-cols-[1.4fr_.6fr_.7fr_.7fr] items-center gap-4 px-5 py-4 text-sm"><div><div className="font-semibold">{a.title}</div><div className="mt-1 text-xs text-muted-foreground">{a.task}</div></div><span className="text-muted-foreground">{a.type}</span><StatusBadge status={a.status==='Completed'?'Teacher-reviewed':'Awaiting review'}/><span className="text-xs text-muted-foreground">{a.submitted||'—'}</span></div>)}</div></div></div></>; }
function Profile({onToast}:{onToast:(v:string)=>void}){
  const current = getCurrentStudent();
  const account = getStudentAccount(current.id);
  const displayName = account?.fullName || account?.name || current.name;
  const email = account?.email || current.email;
  const batch = account?.batch || current.batch;
  const targetBand = '7.0';
  const [username, setUsername] = useState(account?.username || current.username || email.split('@')[0]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const save = (e: FormEvent) => {
    e.preventDefault();
    const nextUsername = username.trim();
    if (nextUsername.length < 3) { setError('Username must be at least 3 characters.'); return; }
    const taken = listStudentAccounts().some((s) => {
      if (s.id === current.id) return false;
      const key = nextUsername.toLowerCase();
      return (s.username || '').toLowerCase() === key
        || (s.studentId || '').toLowerCase() === key
        || (s.email || '').toLowerCase() === key;
    });
    if (taken) { setError('This username is already used by another student.'); return; }

    const patch: Record<string, string> = { username: nextUsername };
    if (newPassword || confirmPassword) {
      if (!currentPassword) { setError('Enter your current password to change it.'); return; }
      if (!account || currentPassword !== account.password) { setError('Current password is incorrect.'); return; }
      if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
      patch.password = newPassword;
    }

    const saved = updateStudentAccount(current.id, patch);
    if (!saved) { setError('Could not save your account.'); return; }
    setCurrentStudent({ ...current, username: nextUsername });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    onToast(patch.password
      ? 'Username and password saved. Use these details next time you sign in.'
      : 'Username saved. Use this username next time you sign in.');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">
      <div className="card flex flex-col items-center p-8 text-center">
        <Avatar initials={initialsFromName(displayName)} size="lg"/>
        <h2 className="mt-4 font-display text-xl font-bold">{displayName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
        <Badge tone="blue">Academic learner</Badge>
        <div className="mt-7 w-full border-t border-border pt-5 text-left text-sm">
          <div className="flex justify-between py-2"><span className="text-muted-foreground">Batch</span><strong>{batch}</strong></div>
          <div className="flex justify-between py-2"><span className="text-muted-foreground">Target band</span><strong>{targetBand}</strong></div>
          <div className="flex justify-between py-2"><span className="text-muted-foreground">Joined</span><strong>Feb 2025</strong></div>
        </div>
      </div>
      <form className="card p-6 sm:p-8" onSubmit={save}>
        <div className="eyebrow">Personal details</div>
        <h2 className="mt-1 font-display text-xl font-bold">Your profile</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your name, email, batch, and target band are set by your campus. You can only change your username and password.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">Full name
            <input value={displayName} readOnly className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground"/>
          </label>
          <label className="block text-sm font-semibold">Email address
            <input value={email} readOnly className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground"/>
          </label>
          <label className="block text-sm font-semibold">Target band
            <input value={targetBand} readOnly className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground"/>
          </label>
          <label className="block text-sm font-semibold">Username
            <input data-testid="input-profile-username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"/>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">You can also sign in with your email.</span>
          </label>
          <label className="block text-sm font-semibold">Current password
            <input data-testid="input-profile-current-password" type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"/>
          </label>
          <label className="block text-sm font-semibold">New password
            <input data-testid="input-profile-new-password" type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"/>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">At least 6 characters. Leave blank to keep your current password.</span>
          </label>
          <label className="block text-sm font-semibold">Confirm new password
            <input data-testid="input-profile-confirm-password" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"/>
          </label>
        </div>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="mt-7">Save changes</Button>
      </form>
    </div>
  );
}

function TeacherDashboard() {
  const [, setLocation] = useLocation();
  const teacher = getCurrentTeacher();
  const firstName = (teacher.fullName || teacher.name || 'Nadia').split(' ')[0];
  const teacherBatches = ['Morning Batch A', 'Morning Batch B'];
  const snapshotData = teacherBatches.map((batchName) => {
    const batchStudents = listTeacherRoster().filter((s) => s.batch === batchName);
    const count = batchStudents.length;
    const avg = count > 0 ? (batchStudents.reduce((acc, s) => acc + s.band, 0) / count).toFixed(1) : 'N/A';
    const status = parseFloat(avg) >= 6.5 ? 'On track' : 'Needs attention';
    return [batchName, count.toString(), avg, status];
  });
  const queue = listTeacherRoster().filter((s) => teacherBatches.includes(s.batch)).slice(0, 4);

  return (
    <>
      <SectionTitle
        eyebrow="Teacher workspace"
        title={`Good morning, ${firstName}.`}
        description={`Here’s what needs your attention across ${teacherBatches.join(' and ')}.`}
        action={<Button onClick={() => setLocation('/teacher/homework/new')}><Plus size={16} />Create homework</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending reviews" value="12" detail="4 due today" icon={<FileText size={17} />} accent="amber" />
        <StatCard label="Active students" value={snapshotData.reduce((acc, r) => acc + parseInt(r[1], 10), 0).toString()} detail={`Across ${teacherBatches.length} batches`} icon={<Users size={17} />} />
        <StatCard label="Average band" value="6.4" detail="+0.3 this month" icon={<Target size={17} />} accent="blue" />
        <StatCard label="Active homework" value="7" detail="2 closing this week" icon={<ClipboardCheck size={17} />} accent="amber" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="eyebrow">Review queue</div>
              <h2 className="mt-1 font-display text-lg font-bold">Needs your eye</h2>
            </div>
            <Link href="/teacher/reviews" className="text-xs font-bold text-primary">See queue</Link>
          </div>
          <div className="mt-5 space-y-3">
            {queue.map((s, i) => (
              <Link href="/teacher/reviews/1021" key={s.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted">
                <Avatar initials={s.initials} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i % 2 ? 'Technology in the workplace' : 'Urban transport…'}</span>
                </span>
                <span className="text-xs text-amber-700">{i + 1}d</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="eyebrow">Quick view</div>
              <h2 className="mt-1 font-display text-lg font-bold">Batch snapshot</h2>
            </div>
            <Link href="/teacher/batches" className="text-xs font-bold text-primary">View batches</Link>
          </div>
          <div className="space-y-3">
            {snapshotData.map((r) => (
              <Link key={r[0]} href={`/teacher/batches/${encodeURIComponent(r[0])}`} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40">
                <div>
                  <div className="text-sm font-semibold">{r[0]}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{r[1]} students · avg {r[2]}</div>
                </div>
                <StatusBadge status={r[3]} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function TeacherTablePage({page}:{page:string}){ const [query,setQuery]=useState(''); const [toast,setToast]=useState(''); const [,setLocation]=useLocation(); const [selectedBatch, setSelectedBatch]=useState('All batches'); const titles:Record<string,[string,string]>={batches:['Batches','Keep each cohort moving together.'],students:['Students','Find a learner, see their recent work, and guide the next step.'],homework:['Homework','Create, schedule, and follow assignments across your batches.'],reviews:['Review queue','12 responses are waiting for your expert eye.'],results:['Results','Your published feedback and student outcomes.'],reports:['Reports','Turn classroom activity into a clear next move.']}; const t=titles[page]||titles.students; if(page==='reviews') return <ReviewQueue/>; if(page==='reports') return <Reports/>; if(page==='students') return <TeacherStudentsList/>; const roster=listTeacherRoster(); const filtered=roster.filter(s=>(s.name.toLowerCase().includes(query.toLowerCase())||s.batch.toLowerCase().includes(query.toLowerCase())||(s.username||s.email).toLowerCase().includes(query.toLowerCase())) && (selectedBatch === 'All batches' || s.batch === selectedBatch)); const uniqueBatches = Array.from(new Set(roster.map(s => s.batch))); return <><SectionTitle eyebrow="Teacher workspace" title={t[0]} description={t[1]} action={page==='homework'?<Button onClick={()=>setLocation('/teacher/homework/new')}><Plus size={16}/>New homework</Button>:page==='students'?<Button onClick={()=>setLocation('/teacher/students/new')}><Plus size={16}/>Add student</Button>:undefined}/><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><SearchInput value={query} onChange={setQuery} placeholder={page==='batches'?'Search batches':'Search students'}/><div className="flex gap-2"><select value={selectedBatch} onChange={e=>setSelectedBatch(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2 text-sm font-semibold"><option value="All batches">All batches</option>{uniqueBatches.map(b=><option key={b} value={b}>{b}</option>)}</select></div></div>{page==='batches'?<div className="grid gap-4 md:grid-cols-3">{[['Morning Batch A','18 learners','6.6 avg','Mon · Wed · Fri'],['Morning Batch B','14 learners','6.1 avg','Tue · Thu'],['Evening Batch A','10 learners','6.4 avg','Mon · Thu']].map((r,i)=><Link href={`/teacher/batches/${encodeURIComponent(r[0])}`} className="card p-5 block hover:border-primary transition" key={r[0]}><div className="flex items-start justify-between"><div className="rounded-lg bg-teal-50 p-2 text-primary"><Users size={18}/></div><MoreHorizontal size={17} className="text-muted-foreground"/></div><h2 className="mt-5 font-display text-lg font-bold">{r[0]}</h2><p className="mt-1 text-xs text-muted-foreground">{r[3]}</p><div className="mt-5 flex justify-between text-sm"><span className="text-muted-foreground">{r[1]}</span><strong>{r[2]}</strong></div><ProgressBar value={i===1?62:78}/></Link>)}</div>:page==='homework'?<HomeworkTeacher onToast={setToast}/>:page==='results'?<ResultsTeacher/>:<div className="card overflow-hidden"><div className="mobile-scroll"><div className="min-w-[780px]"><div className="grid grid-cols-[1.3fr_1.2fr_.7fr_.7fr_.5fr] gap-4 bg-muted/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span>Student</span><span>Batch</span><span>Band</span><span>Trend</span><span>Action</span></div>{filtered.map(s=><button type="button" key={s.id} onClick={()=>setLocation(page === 'students' ? `/teacher/students/${s.id}` : '/teacher/reviews/1021')} className="data-row grid w-full grid-cols-[1.3fr_1.2fr_.7fr_.7fr_.5fr] items-center gap-4 px-5 py-4 text-left text-sm hover:bg-muted/50"><div className="flex items-center gap-3"><Avatar initials={s.initials} size="sm"/><div><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground">ID {s.username || s.email.split('@')[0]}</div></div></div><span className="text-muted-foreground">{s.batch}</span><strong>{s.band > 0 ? s.band.toFixed(1) : '—'}</strong><span className={s.trend.startsWith('+')?'text-emerald-700':s.trend.startsWith('-')?'text-red-700':'text-muted-foreground'}>{s.trend}</span><span className="text-xs font-bold text-primary">{page==='students'?'Open record':'Open'}</span></button>)}</div></div></div>}{toast&&<Toast message={toast} onClose={()=>setToast('')}/>}</>; }
function HomeworkTeacher({onToast}:{onToast:(s:string)=>void}){ return <HomeworkTeacherList onToast={onToast}/>; }
function ResultsTeacher(){return <div className="card overflow-hidden"><div className="mobile-scroll"><div className="min-w-[680px]"><div className="grid grid-cols-[1.3fr_1fr_.6fr_.7fr] gap-4 bg-muted/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span>Published result</span><span>Student</span><span>Band</span><span>Date</span></div>{students.slice(0,5).map(s=><div className="data-row grid grid-cols-[1.3fr_1fr_.6fr_.7fr] items-center gap-4 px-5 py-4 text-sm" key={s.id}><div className="font-semibold">Technology in the workplace</div><div className="flex items-center gap-2"><Avatar initials={s.initials} size="sm"/>{s.name}</div><strong>{s.band.toFixed(1)}</strong><span className="text-xs text-muted-foreground">Jun 9, 2025</span></div>)}</div></div></div>;}
function ReviewQueue(){ return <ReviewQueueLive/>; }
function TeacherCreateHomeworkPage() { return <HomeworkComposer/>; }
function NotFound(){ return <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center"><div className="eyebrow">404 · Not in the syllabus</div><h1 className="mt-3 font-display text-4xl font-bold">This page took a wrong turn.</h1><Link href="/student/dashboard" className="btn-primary mt-6 rounded-lg px-5 py-3 text-sm font-bold">Back to workspace</Link></div>; }
function RoutedErrorBoundary({children}:{children:ReactNode}){const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}
function AppRouter(){ const [location]=useLocation(); const role:Role=location.startsWith('/admin')?'admin':location.startsWith('/branch-admin')?'branch-admin':location.startsWith('/teacher')?'teacher':'student'; const page = location.split('/').filter(Boolean).at(-1); 
  if(location==='/') return <BranchSelection/>;
  if(location==='/login') return <Login/>; 
  if(location==='/super-admin-login') return <SuperAdminLogin/>;
  if(location==='/branch-admin-login') return <BranchAdminLogin/>;
  let content:ReactNode; 
  if(location==='/student/dashboard')content=<StudentDashboard/>; 
  else if(location==='/student/homework')content=<HomeworkPage/>; 
  else if(location==='/student/notes')content=<StudentNotes />;
  else if(location.startsWith('/student/notes/')) content=<StudentNoteReader noteId={decodeURIComponent(location.split('/')[3] || '')} />; 
  else if(location.match(/^\/student\/homework\/.+\/do$/)) content=<HomeworkDo assignmentId={decodeURIComponent(location.split('/')[3])} mode="do"/>;
  else if(location.startsWith('/student/homework/') && location !== '/student/homework/08/write') content=<HomeworkDo assignmentId={decodeURIComponent(location.split('/')[3])} mode="detail"/>;
  else if(location==='/student/homework/08/write')content=<Writer/>; 
  else if(location==='/student/practice')content=<PracticePage/>; 
  else if(/^\/student\/practice\/(reading|listening|writing|speaking)$/.test(location)) content=<PracticePage skill={location.split('/').pop()} />; 
  else if(['/student/results','/student/history','/student/profile'].includes(location))content=<StudentSupporting page={page||'results'}/>; 
  else if(location==='/student/mocks' || ['/student/mocks/available','/student/mocks/in-progress','/student/mocks/completed','/student/mocks/results'].includes(location)) content=<MockExamsHub tab={(location.split('/')[3] || 'upcoming').replace('-', '_')} />;
  else if(location.startsWith('/student/mocks/')) content=<MockBriefing assignmentId={decodeURIComponent(location.split('/')[3] || '')} />;
  else if(location.startsWith('/student/mock-attempt/')) content=<MockRoom attemptId={decodeURIComponent((location.split('/')[3] || '').split('?')[0])} />;
  else if(location==='/teacher/dashboard')content=<TeacherDashboard/>; 
  else if(location==='/teacher/settings')content=<TeacherSettings/>; 
  else if(location==='/teacher/homework/new')content=<TeacherCreateHomeworkPage/>;
  else if(location==='/teacher/students/new')content=<TeacherAddStudentPage />;
  else if(location==='/teacher/notes')content=<TeacherNotes />;
  else if(location==='/teacher/mocks' || location==='/teacher/mocks/library')content=<MockLibraryPage/>;
  else if(location==='/teacher/mocks/assign')content=<AssignMock/>;
  else if(location==='/teacher/mocks/assigned')content=<AssignedMocksPage/>;
  else if(location==='/teacher/mocks/live' || location.startsWith('/teacher/mocks/live/')) content=<LiveMonitoringPage assignmentId={location.split('/')[4]} />;
  else if(location==='/teacher/mocks/results' || location.startsWith('/teacher/mocks/results/')) content=<MockResultsPage assignmentId={location.split('/')[4]} />;
  else if(['/teacher/batches','/teacher/students','/teacher/homework','/teacher/reviews','/teacher/results','/teacher/reports'].includes(location))content=<TeacherTablePage page={page||'students'}/>; 
  else if(location.startsWith('/teacher/batches/') && location.endsWith('/add-student')) {
    const batchId = location.split('/')[3];
    content=<TeacherAddStudentPage batchId={batchId} />;
  }
  else if(location.startsWith('/teacher/batches/')) {
    const batchId = location.split('/').pop() || '';
    content=<TeacherBatchDetailPage batchId={batchId} />;
  }
  else if(location.startsWith('/teacher/students/')) {
    const studentId = decodeURIComponent((location.split('/').pop() || '').split('#')[0]);
    content=<TeacherStudentDetailPage studentId={studentId} />;
  }
  else if(location==='/teacher/reviews/1021')content=<ReviewPage/>; 
  else if(location==='/admin/dashboard')content=<AdminDashboard/>; 
  else if(location==='/admin/branches/new')content=<AddBranchPage/>;
  else if(location==='/admin/practice-papers/new')content=<AddPracticePaperPage/>;
  else if(location.startsWith('/admin/branches/')) {
    const branchId = location.split('/').pop() || '';
    content=<BranchDetailPage branchId={branchId} />;
  }
  else if(location==='/admin/settings')content=<SuperAdminSettings/>;
  else if(['/admin/branches','/admin/branch-admins','/admin/practice-papers','/admin/teachers','/admin/students','/admin/batches','/admin/questions','/admin/reports','/admin/ai-settings','/admin/audit'].includes(location))content=<AdminTablePage page={page||'teachers'}/>; 
  else if(location==='/branch-admin/settings')content=<BranchAdminSettingsPage/>;
  else if(location==='/branch-admin/dashboard')content=<BranchAdminDashboard/>;
  else if(location==='/branch-admin/teachers/new')content=<AddTeacherPage/>;
  else if(location.startsWith('/branch-admin/teachers/')) {
    const teacherId = location.split('/').pop() || '';
    content=<EditTeacherPage teacherId={teacherId} />;
  }
  else if(location==='/branch-admin/students/new')content=<AddStudentPage/>;
  else if(location==='/branch-admin/batches/new')content=<AddBatchPage/>;
  else if(location.startsWith('/branch-admin/batches/')) {
    const batchId = location.split('/').pop() || '';
    content=<BranchBatchDetailPage batchId={batchId} />;
  }
  else if(location.startsWith('/branch-admin/students/')) {
    const studentId = location.split('/').pop() || '';
    content=<BranchStudentDetailPage studentId={studentId} />;
  }
  else if(['/branch-admin/teachers','/branch-admin/students','/branch-admin/batches','/branch-admin/reports'].includes(location))content=<BranchAdminTablePage page={page||'teachers'}/>;
  else content=<NotFound/>; 
  return <Shell role={role}>{content}</Shell>; 
}
function App(){return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><RoutedErrorBoundary><AppRouter/></RoutedErrorBoundary></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;}
export default App;