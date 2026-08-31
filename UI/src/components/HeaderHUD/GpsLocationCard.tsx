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
      className="group flex select-none items-center gap-2.5 rounded-full border border-subtle bg-surface-elevated py-1.5 pl-4 pr-1.5 outline-none transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:border-glow hover:bg-surface-hover hover:shadow-[0_0_20px_rgba(56,189,248,0.25)] active:translate-y-0 active:scale-[0.97] max-[768px]:gap-2 max-[768px]:py-1 max-[768px]:pl-3"
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
          width="18"
          height="18"
          fill="currentColor"
        >
          <path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm-5.91 11c.424-2.507 2.403-4.486 4.91-4.91v-2.021c-3.617.452-6.479 3.314-6.931 6.931h2.021zm6.91-4.91c2.507.423 4.486 2.402 4.91 4.91h2.021c-.452-3.617-3.314-6.479-6.931-6.931v2.021zm4.91 6.91c-.424 2.507-2.403 4.486-4.91 4.91v2.021c3.617-.452 6.479-3.314 6.931-6.931h-2.021zm-6.91 4.91c-2.507-.424-4.486-2.403-4.91-4.91h-2.021c.452 3.617 3.313 6.479 6.931 6.931v-2.021zm1-7.91c-1.104 0-2 .896-2 2s.896 2 2 2 2-.896 2-2-.896-2-2-2z" />
        </svg>
      </div>
    </button>
  );
}
