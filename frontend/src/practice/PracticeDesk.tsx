import { type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';

const SKILLS = [
  { href: '/student/practice/reading', label: 'Reading' },
  { href: '/student/practice/listening', label: 'Listening' },
  { href: '/student/practice/writing', label: 'Writing' },
  { href: '/student/practice/speaking', label: 'Speaking' },
];

export default function PracticeDesk({ title, children }: { title: string; children: ReactNode }) {
  const [location, setLocation] = useLocation();
  return (
    <div className="flex min-h-dvh flex-col bg-[#f4f1eb]">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#1b2430] text-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation('/student/dashboard')}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              <ArrowLeft size={14} /> Workspace
            </button>
            <img src="/fti-logo.jpg" alt="" className="hidden h-8 rounded bg-white object-contain p-0.5 sm:block" />
            <span className="truncate text-sm font-semibold">{title}</span>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-6">
          <button
            type="button"
            onClick={() => setLocation('/student/practice')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${location === '/student/practice' ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10'}`}
          >
            All skills
          </button>
          {SKILLS.map((skill) => (
            <button
              key={skill.href}
              type="button"
              onClick={() => setLocation(skill.href)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${location === skill.href ? 'bg-primary text-white' : 'text-white/70 hover:bg-white/10'}`}
            >
              {skill.label}
            </button>
          ))}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1480px] flex-1 p-5 md:p-8">{children}</div>
    </div>
  );
}
