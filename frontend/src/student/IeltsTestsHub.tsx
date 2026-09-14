import { BookOpen, Headphones, Mic, PencilLine } from 'lucide-react';
import { useLocation } from 'wouter';
import { SectionTitle } from '@/components/ui-kit';
import PracticeDesk from '@/practice/PracticeDesk';

const SKILLS = [
  {
    id: 'reading',
    title: 'IELTS Reading Tests',
    href: '/student/practice/reading',
    blurb: 'Full papers and passages, grouped by book.',
    icon: BookOpen,
  },
  {
    id: 'listening',
    title: 'IELTS Listening Tests',
    href: '/student/practice/listening',
    blurb: 'Sections 1–4 and full mocks, grouped by book.',
    icon: Headphones,
  },
  {
    id: 'writing',
    title: 'IELTS Writing Tests',
    href: '/student/practice/writing',
    blurb: 'Task 1, Task 2, and full writing tests.',
    icon: PencilLine,
  },
  {
    id: 'speaking',
    title: 'IELTS Speaking Tests',
    href: '/student/practice/speaking',
    blurb: 'Parts 1–3 and full speaking mocks.',
    icon: Mic,
  },
];

export default function IeltsTestsHub() {
  const [, setLocation] = useLocation();
  return (
    <PracticeDesk title="IELTS Practice">
      <SectionTitle
        eyebrow="IELTS Practice"
        title="IELTS Test Collection"
        description="Pick a skill. Each skill opens its books, then the tests inside that book."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <button
              key={skill.id}
              type="button"
              onClick={() => setLocation(skill.href)}
              className="flex items-start gap-4 rounded-xl border border-border bg-card p-6 text-left hover:border-primary/50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon size={20} />
              </span>
              <span>
                <span className="block font-display text-lg font-bold text-primary">{skill.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{skill.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </PracticeDesk>
  );
}
