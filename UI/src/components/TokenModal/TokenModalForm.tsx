import type { RefObject } from 'react';

interface TokenModalFormProps {
  token: string;
  onTokenChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export default function TokenModalForm({ token, onTokenChange, onSave, onCancel, inputRef }: TokenModalFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.85rem] leading-relaxed text-secondary">
        To render the 3D map, enter your Mapbox Public Access Token (starts with{' '}
        <code className="rounded-full border border-subtle bg-[rgba(15,23,42,0.8)] px-2.5 py-0.5 font-mono text-[0.82rem] text-accent-cyan">pk.eyJ...</code>).
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="mapbox-token-input" className="px-1 text-[0.7rem] font-semibold tracking-wider text-muted">
          MAPBOX ACCESS TOKEN
        </label>
        <input
          ref={inputRef}
          id="mapbox-token-input"
          type="text"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            else if (e.key === 'Escape') onCancel();
          }}
          placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSI..."
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-full border border-subtle bg-[rgba(5,7,13,0.8)] px-5 py-3.5 font-mono text-[0.82rem] text-primary outline-none transition-all focus:border-accent-cyan focus:shadow-[0_0_0_3px_rgba(56,189,248,0.2)]"
        />
        <span className="px-1 text-[0.74rem] text-muted">
          Don't have a token?{' '}
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-cyan hover:underline">
            Get a free token on Mapbox
          </a>
        </span>
      </div>

      <div className="mt-2 flex justify-end">
        <button
          onClick={onSave}
          className="flex items-center gap-2.5 rounded-full border border-accent-cyan/50 bg-linear-to-br from-[#0284c7] to-[#4f46e5] px-6 py-3 font-sans text-[0.85rem] font-semibold text-white shadow-[0_0_16px_rgba(56,189,248,0.3)] transition-all hover:-translate-y-px hover:shadow-[0_0_22px_rgba(56,189,248,0.5)] active:translate-y-0"
        >
          <span>Apply & Load 3D Map</span>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </div>
  );
}
