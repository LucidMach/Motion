interface TokenModalHeaderProps {
  onClose: () => void;
}

export default function TokenModalHeader({ onClose }: TokenModalHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
          </svg>
        </div>
        <div>
          <h2 className="font-display text-[1.15rem] font-bold text-primary">Mapbox Configuration</h2>
          <p className="text-[0.78rem] text-secondary">Configure your public Mapbox access token</p>
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close modal"
        className="rounded-sm p-1 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}
