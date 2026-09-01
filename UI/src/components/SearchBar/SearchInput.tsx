import React from 'react';

interface SearchInputProps {
  query: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onEscape?: () => void;
  escapeActionLabel?: 'Back' | 'Close' | 'Clear';
  isLoading: boolean;
  isOpen: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function SearchInput({
  query,
  onChange,
  onSubmit,
  onClear,
  onEscape,
  escapeActionLabel = 'Clear',
  isLoading,
  isOpen,
  inputRef,
}: SearchInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (onEscape) {
        onEscape();
      } else {
        onClear();
      }
    }
  };

  return (
    <div
      className={`group relative flex h-14 w-full items-center rounded-full border bg-surface-elevated/95 px-4 shadow-glass backdrop-blur-xl transition-all duration-300 ${
        isOpen
          ? 'border-accent-cyan/80 shadow-[0_0_25px_rgba(56,189,248,0.25),0_8px_32px_rgba(0,0,0,0.5)]'
          : 'border-subtle hover:border-accent-cyan/50 hover:shadow-[0_0_20px_rgba(56,189,248,0.15)] focus-within:border-accent-cyan/80 focus-within:shadow-[0_0_25px_rgba(56,189,248,0.25)]'
      }`}
    >
      {/* Search / Radar Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center text-accent-cyan transition-transform group-focus-within:scale-110">
        {isLoading ? (
          <svg
            className="h-5 w-5 animate-spin text-accent-cyan"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 transition-transform duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </div>

      {/* Main Text Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search station, stop, or landmark (↵ search, ↑/↓ switch)..."
        aria-label="Search Victorian transit stops and landmarks"
        className="mx-3 flex-1 bg-transparent font-sans text-[0.92rem] font-medium text-primary placeholder-muted outline-none selection:bg-accent-cyan/30 selection:text-white max-[640px]:text-[0.84rem]"
      />

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Dynamic Contextual Action Button (Back / Close / Clear with Esc Badge) */}
        {query.trim().length > 0 && (
          <button
            type="button"
            onClick={onEscape || onClear}
            title={
              escapeActionLabel === 'Back'
                ? 'Back to match list (Esc)'
                : escapeActionLabel === 'Close'
                ? 'Close results list (Esc)'
                : 'Clear search bar (Esc)'
            }
            aria-label={`${escapeActionLabel} (Esc)`}
            className="flex items-center gap-1.5 rounded-full border border-subtle/80 bg-surface-hover/70 px-2.5 py-1 text-secondary transition-all hover:border-subtle hover:bg-surface-hover hover:text-primary cursor-pointer active:scale-95"
          >
            {escapeActionLabel === 'Back' ? (
              <svg
                className="h-3 w-3 text-accent-cyan"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            ) : (
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}

            <span className="hidden sm:inline font-display text-[0.72rem] font-semibold text-secondary">
              {escapeActionLabel}
            </span>

            <kbd className="rounded bg-deep/90 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted border border-subtle/80">
              Esc
            </kbd>
          </button>
        )}

        {/* Enter key badge & Search Action Button */}
        <button
          type="button"
          onClick={onSubmit}
          title="Hit Enter to search"
          aria-label="Execute search"
          className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-hover/80 px-3 py-1.5 font-display text-[0.72rem] font-semibold text-secondary transition-all hover:border-accent-cyan/50 hover:bg-accent-cyan/15 hover:text-accent-cyan active:scale-95 cursor-pointer max-[640px]:px-2.5"
        >
          <span className="hidden sm:inline">Search</span>
          <kbd className="rounded bg-deep/80 px-1.5 py-0.5 font-mono text-[0.68rem] text-primary border border-subtle">
            ↵
          </kbd>
        </button>
      </div>
    </div>
  );
}
