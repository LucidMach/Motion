interface GpsLocationCardProps {
  locationName: string;
  accuracyText: string;
  onRecenter: () => void;
}

export default function GpsLocationCard({ locationName, accuracyText, onRecenter }: GpsLocationCardProps) {
  return (
    <button
      onClick={onRecenter}
      title="Click to fly to your current location"
      aria-label="Recenter to my location"
      className="group flex select-none items-center gap-3 rounded-full border border-subtle bg-surface-elevated py-2 pl-5 pr-2 outline-none transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:border-glow hover:bg-surface-hover hover:shadow-[0_0_20px_var(--color-glow)] active:translate-y-0 active:scale-[0.97] max-[768px]:gap-2.5 max-[768px]:py-1.5 max-[768px]:pl-3.5 max-[768px]:pr-1.5"
    >
      <div className="flex flex-col items-end gap-px text-right">
        <span className="whitespace-nowrap font-sans text-[0.82rem] font-bold leading-[1.15] tracking-[0.01em] text-primary transition-colors group-hover:text-white max-[768px]:text-[0.76rem]">
          {locationName}
        </span>
        <span className="whitespace-nowrap font-sans text-[0.65rem] font-semibold leading-none tracking-[0.02em] text-accent-cyan max-[768px]:text-[0.6rem]">
          {accuracyText}
        </span>
      </div>

      <div className="relative flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan transition-all group-hover:border-accent-cyan group-hover:bg-accent-cyan/20 max-[768px]:h-7.5 max-[768px]:w-7.5">
        <svg
          className="h-4.5 w-4.5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.12] max-[768px]:h-4 max-[768px]:w-4"
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
    </button>
  );
}
