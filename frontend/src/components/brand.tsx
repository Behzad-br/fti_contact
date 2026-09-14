export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className={`inline-flex w-fit max-w-full overflow-hidden rounded-lg ${dark ? 'bg-white p-1.5' : 'border border-border bg-white p-1'}`}>
        <img src="/fti-logo.jpg" alt="FTI Consultants" className="h-9 w-auto max-w-[168px] object-contain object-left sm:h-10 sm:max-w-[190px]" />
      </div>
      <div className={`text-[9px] font-bold uppercase leading-tight tracking-[.1em] ${dark ? 'text-amber-300' : 'text-muted-foreground'}`}>
        IELTS Learning Management System
      </div>
    </div>
  );
}
