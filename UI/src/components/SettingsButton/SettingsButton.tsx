export default function SettingsButton() {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('motion:cmd:open-settings-modal'));
  };

  return (
    <div className="pointer-events-auto absolute bottom-5 left-5 z-10 flex items-center max-[768px]:bottom-3 max-[768px]:left-3">
      <button
        onClick={handleClick}
        title="Customize UI Theme & Gesture Interactions"
        aria-label="Open Studio Settings"
        className="group relative flex h-11 items-center justify-center overflow-hidden rounded-full border border-subtle bg-surface-elevated/90 p-2 text-secondary shadow-glass backdrop-blur-xl outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-glow hover:bg-surface-hover hover:px-3.5 hover:text-accent-cyan hover:shadow-[0_0_20px_var(--color-glow)] active:translate-y-0 active:scale-95"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan transition-all group-hover:border-accent-cyan/60 group-hover:bg-accent-cyan/20">
          <svg
            className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </div>

        <span className="max-w-0 overflow-hidden whitespace-nowrap font-display text-[0.78rem] font-bold tracking-wider text-primary opacity-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:max-w-24 group-hover:pl-2 group-hover:opacity-100 group-hover:text-accent-cyan">
          SETTINGS
        </span>
      </button>
    </div>
  );
}
