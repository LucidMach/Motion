import { useEffect, useState } from 'react';
import type { ThemeChangeEventDetail } from '../../types/events';

interface BrandGroupProps {
  regionLabel: string;
  regionUpdated: boolean;
}

export default function BrandGroup({ regionLabel, regionUpdated }: BrandGroupProps) {
  const [, setRenderTrigger] = useState(0);

  useEffect(() => {
    const onThemeChange = () => setRenderTrigger((prev) => prev + 1);
    window.addEventListener('motion:theme-change', onThemeChange);
    return () => window.removeEventListener('motion:theme-change', onThemeChange);
  }, []);

  return (
    <div className="flex select-none items-center gap-3.5">
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-cyan/40 bg-linear-to-br from-accent-cyan/20 to-accent-indigo/20 text-accent-cyan transition-all duration-300 shadow-[0_0_12px_var(--color-glow)]"
        title="Motion Transit 3D Engine"
      >
        {typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'tron' ? (
          <svg
            className="h-6 w-6 animate-float-slight"
            style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-cyan))' }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="9.5" stroke="var(--color-accent-cyan)" strokeWidth="1.8" fill="rgba(0, 243, 255, 0.12)" />
            <circle cx="12" cy="12" r="6" stroke="var(--color-accent-cyan)" strokeWidth="1.4" strokeDasharray="3 2" opacity="0.85" />
            <circle cx="12" cy="12" r="2.5" fill="var(--color-accent-cyan)" />
          </svg>
        ) : (
          <svg
            className="h-5.5 w-5.5 animate-float-slight"
            style={{ filter: 'drop-shadow(0 0 6px var(--color-accent-cyan))' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 19 21 12 17 5 21 12 2" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-px overflow-hidden">
        <h1
          className="bg-clip-text font-display text-xl font-extrabold leading-tight tracking-[0.12em] text-transparent transition-all duration-300"
          style={{
            backgroundImage: 'var(--color-brand-gradient, linear-gradient(90deg, #ffffff 0%, var(--color-accent-cyan) 55%, var(--color-accent-indigo) 100%))'
          }}
        >
          MOTION
        </h1>
        <span
          title={regionLabel}
          className={`max-w-115 overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] font-semibold uppercase tracking-[0.04em] transition-colors duration-300 max-[1024px]:max-w-75 max-[768px]:max-w-45 max-[768px]:text-[0.68rem] max-[480px]:hidden ${regionUpdated ? 'text-accent-cyan font-bold' : 'text-secondary'
            }`}
        >
          {regionLabel}
        </span>

      </div>
    </div>
  );
}
