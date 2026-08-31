import { useState } from 'react';

interface TokenSettingsTabProps {
  onTokenUpdated: (newToken: string) => void;
}

const TOKEN_STORAGE_KEY = 'motion_mapbox_token';

export default function TokenSettingsTab({ onTokenUpdated }: TokenSettingsTabProps) {
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(TOKEN_STORAGE_KEY) || (import.meta.env.PUBLIC_MAPBOX_TOKEN as string) || '';
  });
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    onTokenUpdated(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-[0.74rem] font-bold tracking-wider text-muted uppercase">
          Mapbox Public Access Token
        </label>
        <p className="text-[0.84rem] leading-relaxed text-secondary">
          Configure the public API token required to stream Mapbox Standard 3D tiles, elevation topography, and basemap vector features.
        </p>

        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSI..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-subtle bg-[rgba(5,7,13,0.8)] px-4 py-3.5 pr-20 font-mono text-[0.82rem] text-primary outline-none transition-all focus:border-accent-cyan focus:shadow-[0_0_0_3px_rgba(56,189,248,0.2)]"
            />
            {token && (
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-2 top-2 rounded-full border border-subtle bg-surface-elevated px-2.5 py-1.5 text-[0.7rem] font-semibold text-secondary transition-all hover:border-glow hover:text-accent-cyan"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-[0.74rem] text-muted">
              Get your free key at{' '}
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-cyan hover:underline"
              >
                mapbox.com
              </a>
            </span>

            {saved && (
              <span className="text-[0.75rem] font-bold text-accent-emerald animate-pulse">
                ✓ Token saved & reloaded!
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-2 rounded-full border border-accent-cyan/50 bg-linear-to-br from-[#0284c7] to-[#4f46e5] px-6 py-2.5 font-sans text-[0.84rem] font-semibold text-white shadow-[0_0_16px_rgba(56,189,248,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_22px_rgba(56,189,248,0.5)] active:translate-y-0"
        >
          <span>Save & Apply Token</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2}>
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
}
