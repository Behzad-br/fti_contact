import { type ReactNode, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Cpu } from 'lucide-react';

gsap.registerPlugin(useGSAP);

function SoftMesh() {
  return (
    <svg
      className="hero-mesh pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="rgba(232,119,34,.2)" strokeWidth="0.16" strokeDasharray="1.6 3.8">
        <path className="hero-flow" d="M20 24 L50 48 L80 22" />
        <path className="hero-flow" d="M14 58 L50 48 L86 56" />
        <path className="hero-flow" d="M30 86 L50 48 L70 88" />
        <circle className="hero-flow" cx="50" cy="48" r="20" />
      </g>
    </svg>
  );
}

export default function AuthHero({
  title,
  accent,
}: {
  eyebrow?: string;
  title: ReactNode;
  accent?: string;
  text?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      gsap.set('.hero-ring-a', { xPercent: -50, yPercent: -50 });

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      gsap.fromTo('.hero-chrome', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out' });
      gsap.fromTo(
        '.hero-lms-mark',
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.85, delay: 0.18, ease: 'power3.out' },
      );

      const desktop = window.matchMedia('(min-width: 1024px)').matches;
      if (desktop) {
        gsap.fromTo(
          '.hero-bg-img',
          { scale: 1.03 },
          { scale: 1.055, duration: 52, ease: 'sine.inOut', repeat: -1, yoyo: true },
        );
        gsap.to('.hero-flow', { strokeDashoffset: -14, duration: 32, ease: 'none', repeat: -1 });
        gsap.to('.hero-scan', { yPercent: 720, duration: 22, ease: 'none', repeat: -1 });
      }

      gsap.to('.hero-core-glow', {
        opacity: 0.48,
        scale: 1.1,
        duration: 6.2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });

      gsap.fromTo(
        '.hero-accent',
        { backgroundPosition: '0% 50%' },
        { backgroundPosition: '200% 50%', duration: 10, ease: 'none', repeat: -1 },
      );

      gsap.fromTo(
        '.hero-lms-shimmer',
        { backgroundPosition: '0% 50%' },
        { backgroundPosition: '200% 50%', duration: 7.5, ease: 'none', repeat: -1 },
      );
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className="hero-stage relative flex w-full min-w-0 flex-col overflow-hidden"
    >
      <div className="hero-field pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/fti-hero-academy.jpg"
          alt=""
          className="hero-bg-img absolute inset-0 h-full w-full scale-[1.03] object-cover object-[68%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,5,.72)_0%,rgba(8,7,5,.48)_40%,rgba(8,7,5,.78)_100%)] lg:bg-[linear-gradient(118deg,rgba(8,7,5,.90)_0%,rgba(8,7,5,.56)_48%,rgba(8,7,5,.32)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_45%,rgba(232,119,34,.16),transparent_48%)]" />
        <div className="hero-grid hero-tech-grid absolute inset-0 opacity-[0.18] lg:opacity-[0.28]" />
        <SoftMesh />

        <div className="hero-ring-a absolute left-1/2 top-1/2 hidden h-[56%] w-[56%] rounded-full border border-dashed border-[#E87722]/20 lg:block" />

        <div className="absolute left-[70%] top-[46%] z-[2] -translate-x-1/2 -translate-y-1/2 lg:left-1/2 lg:top-[48%]">
          <div className="hero-core-glow absolute inset-[-36px] rounded-full bg-[#E87722]/28 blur-3xl lg:inset-[-42px]" />
          <div className="relative hidden h-16 w-16 items-center justify-center rounded-2xl border border-amber-200/28 bg-black/48 shadow-[0_0_28px_rgba(232,119,34,.32)] backdrop-blur-md lg:flex lg:h-[4.5rem] lg:w-[4.5rem]">
            <Cpu className="text-amber-200" size={26} />
          </div>
        </div>

        <div className="hero-scan pointer-events-none absolute inset-x-0 top-[-12%] hidden h-16 bg-[linear-gradient(180deg,transparent,rgba(251,191,36,.09),transparent)] mix-blend-screen lg:block" />

        <div className="landing-grain landing-grain-hero pointer-events-none absolute inset-0" />
      </div>

      <div className="hero-chrome relative z-10 flex h-full min-h-0 flex-1 flex-col justify-between p-4 pb-4 sm:p-6 sm:pb-6 lg:p-8 lg:pb-20 xl:p-12 xl:pb-24">
        <div className="hero-lms-mark flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-lg bg-white p-1.5">
            <img src="/fti-logo.jpg" alt="FTI Consultants" className="h-8 w-auto max-w-[148px] object-contain object-left sm:h-10 sm:max-w-[190px]" />
          </div>
          <p className="hero-lms-shimmer font-display text-[1.55rem] font-bold leading-none tracking-[0.04em] sm:text-[1.9rem] lg:text-[2.35rem]">
            IELTS LMS
          </p>
        </div>

        <h1 className="max-w-[14ch] text-balance font-display text-[1.35rem] font-bold leading-[1.12] tracking-[-0.04em] text-white sm:text-[1.85rem] lg:text-[2.35rem]">
          {title}
          {accent ? (
            <>
              {' '}
              <span className="hero-accent hero-accent-shimmer inline">{accent}</span>
            </>
          ) : null}
        </h1>
      </div>
    </div>
  );
}
