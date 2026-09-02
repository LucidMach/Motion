import React from 'react';
import type { StopSearchResult } from '../../services/api';
import SearchResultItem from './SearchResultItem';

interface SearchResultsPanelProps {
  isOpen: boolean;
  isLoading: boolean;
  hasSearched: boolean;
  query: string;
  results: StopSearchResult[];
  selectedIndex: number;
  focusedResult: StopSearchResult | null;
  onSelect: (result: StopSearchResult) => void;
  onNavigate: (result: StopSearchResult, e: React.MouseEvent) => void;
  onBackToResults: () => void;
  onNextOption?: () => void;
  onPrevOption?: () => void;
  onClose: () => void;
}

export default function SearchResultsPanel({
  isOpen,
  isLoading,
  hasSearched,
  query,
  results,
  selectedIndex,
  focusedResult,
  onSelect,
  onNavigate,
  onBackToResults,
  onNextOption,
  onPrevOption,
  onClose,
}: SearchResultsPanelProps) {
  if (!isOpen) return null;

  const currentIndex = focusedResult
    ? Math.max(0, results.findIndex((r) => r.stop_id === focusedResult.stop_id))
    : selectedIndex;

  return (
    <div className="absolute bottom-full mb-3 w-full animate-modal-in overflow-hidden rounded-3xl border border-glow bg-surface-elevated/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.65),0_0_30px_rgba(56,189,248,0.18)] backdrop-blur-2xl transition-all max-[768px]:p-3">
      {/* Header bar */}
      <div className="mb-3 flex items-center justify-between border-b border-subtle pb-2.5 px-1">
        {focusedResult ? (
          /* Focused single-result header with Back Button and Next/Prev Arrows */
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onBackToResults}
              aria-label="Back to all matches"
              className="flex items-center gap-1.5 rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1 font-display text-[0.74rem] font-bold text-accent-cyan transition-all hover:border-accent-cyan hover:bg-accent-cyan/20 active:scale-95 cursor-pointer"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Back to results</span>
            </button>

            {/* Up & Down Switch Controls */}
            {results.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onPrevOption}
                  title="Previous option (Up Arrow key ↑)"
                  aria-label="Previous search result"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-hover/80 text-secondary transition-all hover:border-accent-cyan/50 hover:bg-accent-cyan/15 hover:text-accent-cyan active:scale-90 cursor-pointer"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>

                <span className="font-mono text-[0.7rem] font-medium text-accent-cyan px-1">
                  {currentIndex + 1} of {results.length}
                </span>

                <button
                  type="button"
                  onClick={onNextOption}
                  title="Next option (Down Arrow key ↓)"
                  aria-label="Next search result"
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-subtle bg-surface-hover/80 text-secondary transition-all hover:border-accent-cyan/50 hover:bg-accent-cyan/15 hover:text-accent-cyan active:scale-90 cursor-pointer"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                <span className="hidden sm:inline font-mono text-[0.65rem] text-muted ml-1">
                  (↑ / ↓ switch · ↵ navigate)
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Full results list header */
          <div className="flex items-center gap-2">
            <span className="font-display text-[0.78rem] font-bold uppercase tracking-wider text-accent-cyan">
              {isLoading ? 'Searching Transit Network...' : `${results.length} Matches Found`}
            </span>
            {query.trim() && (
              <span className="truncate max-w-40 font-mono text-[0.72rem] text-secondary">
                for "{query}"
              </span>
            )}
            {!isLoading && results.length > 0 && (
              <span className="hidden sm:inline font-mono text-[0.65rem] text-muted">
                (↑ / ↓ navigate · ↵ select)
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline font-mono text-[0.68rem] text-muted">
            Esc to dismiss
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search results"
            className="flex h-6 w-6 items-center justify-center rounded-full text-secondary transition-colors hover:bg-surface-hover hover:text-primary cursor-pointer active:scale-90"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Results Container */}
      <div className="max-h-95 overflow-y-auto space-y-2 pr-0.5 max-[768px]:max-h-70">
        {/* Loading state skeleton */}
        {isLoading && (
          <div className="space-y-2.5 py-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between rounded-2xl border border-subtle/40 bg-surface-elevated/50 p-3"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-9 w-9 rounded-xl bg-slate-800/80" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3.5 w-36 rounded bg-slate-700/60" />
                    <div className="h-2.5 w-20 rounded bg-slate-800/60" />
                  </div>
                </div>
                <div className="h-7 w-20 rounded-full bg-slate-800/60" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state when searched and no results */}
        {!isLoading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-7 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-subtle bg-surface-elevated text-secondary mb-3">
              <svg className="h-6 w-6 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <p className="font-display text-[0.9rem] font-semibold text-primary">
              No matching stops or landmarks found
            </p>
            <p className="mt-1 max-w-xs font-sans text-[0.76rem] text-secondary">
              Try searching for <span className="text-accent-cyan font-medium">The Spot Building</span>, <span className="text-accent-cyan font-medium">Flinders Street</span>, or <span className="text-accent-cyan font-medium">Monash Clayton</span>.
            </p>
          </div>
        )}

        {/* Single Focused Result View (when user has clicked an option) */}
        {!isLoading && focusedResult && (
          <div className="animate-modal-in">
            <SearchResultItem
              result={focusedResult}
              isSelected={true}
              onSelect={() => { }}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {/* Full Result Items List (when no option is focused) */}
        {!isLoading &&
          !focusedResult &&
          results.map((result, idx) => (
            <SearchResultItem
              key={result.stop_id || `${result.stop_name}-${idx}`}
              result={result}
              isSelected={idx === selectedIndex}
              onSelect={onSelect}
              onNavigate={onNavigate}
            />
          ))}
      </div>
    </div>
  );
}
