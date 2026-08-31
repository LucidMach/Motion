interface BrandGroupProps {
  regionLabel: string;
  regionUpdated: boolean;
}

export default function BrandGroup({ regionLabel, regionUpdated }: BrandGroupProps) {
  return (
    <div className="flex select-none items-center gap-3.5">
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent-cyan/40 bg-linear-to-br from-accent-cyan/20 to-accent-indigo/20 text-accent-cyan"
        title="Motion Transit 3D Engine"
      >
        <svg
          className="h-5.5 w-5.5 animate-float-slight drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 19 21 12 17 5 21 12 2" />
        </svg>
      </div>
      <div className="flex flex-col gap-px overflow-hidden">
        <h1
          className="bg-linear-to-r from-white via-accent-cyan to-indigo-400 bg-clip-text font-display text-xl font-extrabold leading-tight tracking-[0.12em] text-transparent"
          style={{ backgroundImage: 'linear-gradient(90deg, #ffffff 0%, #38bdf8 60%, #818cf8 100%)' }}
        >
          MOTION
        </h1>
        <span
          className={`max-w-100 overflow-hidden text-ellipsis whitespace-nowrap text-[0.74rem] font-semibold uppercase tracking-[0.04em] transition-colors duration-300 max-[768px]:max-w-42.5 max-[768px]:text-[0.68rem] max-[480px]:hidden ${regionUpdated ? 'text-accent-cyan' : 'text-secondary'
            }`}
        >
          {regionLabel}
        </span>
      </div>
    </div>
  );
}
