import { type ReactNode } from 'react';
import { Check, ChevronRight, CircleAlert, Clock3, Search, X } from 'lucide-react';

export function Button({ children, className='', variant='primary', onClick, type='button', disabled=false }: { children:ReactNode; className?:string; variant?:'primary'|'quiet'|'outline'|'danger'; onClick?:()=>void; type?:'button'|'submit'; disabled?:boolean }) {
  const styles = variant === 'primary' ? 'btn-primary' : variant === 'quiet' ? 'btn-quiet' : variant === 'danger' ? 'bg-red-50 text-red-700 border border-red-200' : 'border border-border bg-card hover:bg-muted';
  return <button data-testid={`button-${typeof children === 'string' ? children.toLowerCase().replaceAll(' ','-') : 'action'}`} type={type} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}>{children}</button>;
}
export function Badge({ children, tone='neutral' }: {children:ReactNode; tone?:'neutral'|'green'|'amber'|'red'|'orange'|'blue'}) {
  const tones = { neutral:'bg-muted text-muted-foreground', green:'bg-emerald-50 text-emerald-700', amber:'bg-amber-50 text-amber-700', red:'bg-red-50 text-red-700', orange:'bg-orange-50 text-orange-700', blue:'bg-sky-50 text-sky-700' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}
export function Avatar({ initials, size='md', tone='orange' }: {initials:string; size?:'sm'|'md'|'lg'; tone?:'orange'|'amber'|'blue'|'teal'}) {
  const colors = { orange:'bg-orange-100 text-orange-800', amber:'bg-amber-100 text-amber-800', blue:'bg-sky-100 text-sky-800', teal:'bg-teal-100 text-teal-800' };
  const sizes = { sm:'h-8 w-8 text-[10px]', md:'h-10 w-10 text-xs', lg:'h-14 w-14 text-base' };
  return <div className={`${sizes[size]} ${colors[tone]} rounded-full flex items-center justify-center font-bold shrink-0`} data-testid={`avatar-${initials}`}>{initials}</div>;
}
export function SectionTitle({ eyebrow, title, description, action }: {eyebrow?:string; title:string; description?:string; action?:ReactNode}) {
  return <div className="mb-6 flex items-end justify-between gap-4"><div>{eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}<h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}</div>{action}</div>;
}
export function StatusBadge({ status }: {status:string}) {
  const tone = status === 'Completed' || status === 'Published' || status === 'On track' || status === 'Excellent' ? 'green' : status === 'In progress' || status === 'Pending' || status === 'Awaiting review' ? 'amber' : status === 'Needs support' ? 'red' : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}
export function StatCard({ label, value, detail, icon, accent='teal' }: {label:string; value:string; detail?:string; icon:ReactNode; accent?:'teal'|'amber'|'blue'}) {
  return <div className="card p-5"><div className="flex items-start justify-between"><div className="text-xs font-semibold text-muted-foreground">{label}</div><div className={`rounded-lg p-2 ${accent === 'amber' ? 'bg-amber-50 text-amber-700' : accent === 'blue' ? 'bg-sky-50 text-sky-700' : 'bg-teal-50 text-teal-700'}`}>{icon}</div></div><div className="metric-number mt-3 text-3xl font-bold">{value}</div>{detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}</div>;
}
export function EmptyState({ title, text, action }: {title:string; text:string; action?:ReactNode}) { return <div className="card flex flex-col items-center justify-center px-6 py-14 text-center"><div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground"><CircleAlert size={21}/></div><h3 className="font-display text-lg font-bold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>{action && <div className="mt-5">{action}</div>}</div>; }
export function SearchInput({ value, onChange, placeholder='Search...' }: {value:string; onChange:(v:string)=>void; placeholder?:string}) { return <div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted-foreground"/><input data-testid="input-search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm focus:ring-2 focus:ring-ring sm:w-72"/></div>; }
export function ProgressBar({ value, color='accent' }: {value:number; color?:'accent'|'primary'}) { return <div className="progress-track"><div className={`progress-fill ${color==='primary'?'!bg-primary':''}`} style={{width:`${Math.min(value,100)}%`}}/></div>; }
export function Toast({ message, onClose }: {message:string; onClose:()=>void}) { return <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl bg-[hsl(var(--sidebar))] px-4 py-3 text-sm text-white shadow-xl"><Check size={16} className="text-amber-300"/>{message}<button aria-label="Close notification" onClick={onClose}><X size={15}/></button></div>; }
export function Countdown({ seconds }: {seconds:number}) { return <div className="font-mono-ui flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800"><Clock3 size={16}/>{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</div>; }
export function Crumb({ text }: {text:string}) { return <div className="mb-4 flex items-center gap-1 text-xs text-muted-foreground"><span>Workspace</span><ChevronRight size={13}/><span className="text-foreground">{text}</span></div>; }