interface SettingsHeaderProps {
  activeTab: 'theme' | 'gestures' | 'token';
  onTabChange: (tab: 'theme' | 'gestures' | 'token') => void;
  onClose: () => void;
}

export default function SettingsHeader({ activeTab, onTabChange, onClose }: SettingsHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-subtle pb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-cyan/30 bg-accent-cyan/10 p-2 text-accent-cyan shadow-[0_0_12px_rgba(56,189,248,0.25)]">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
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
          <div>
            <h2 className="font-display text-[1.15rem] font-bold tracking-wide text-primary">
              Motion Studio Settings
            </h2>
            <p className="text-[0.76rem] text-secondary">
              Personalize your 3D viewport, theme aesthetic, and navigation gestures
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Close settings modal"
          className="rounded-full p-2 text-muted transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Tabs Navigation */}
      <nav className="flex items-center gap-2 rounded-full border border-subtle bg-[rgba(5,7,13,0.6)] p-1">
        <button
          type="button"
          onClick={() => onTabChange('theme')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-[0.82rem] font-semibold transition-all duration-200 ${
            activeTab === 'theme'
              ? 'border border-accent-cyan/40 bg-surface-elevated text-accent-cyan shadow-[0_0_12px_rgba(56,189,248,0.2)]'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"></path>
          </svg>
          <span>UI Theme</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('gestures')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-[0.82rem] font-semibold transition-all duration-200 ${
            activeTab === 'gestures'
              ? 'border border-accent-cyan/40 bg-surface-elevated text-accent-cyan shadow-[0_0_12px_rgba(56,189,248,0.2)]'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
          </svg>
          <span>UI Gestures</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange('token')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-[0.82rem] font-semibold transition-all duration-200 ${
            activeTab === 'token'
              ? 'border border-accent-cyan/40 bg-surface-elevated text-accent-cyan shadow-[0_0_12px_rgba(56,189,248,0.2)]'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
          </svg>
          <span>Mapbox Token</span>
        </button>
      </nav>
    </div>
  );
}
