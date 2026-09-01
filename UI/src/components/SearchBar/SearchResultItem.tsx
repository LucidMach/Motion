import React from 'react';
import type { StopSearchResult } from '../../services/api';

interface SearchResultItemProps {
  result: StopSearchResult;
  isSelected?: boolean;
  onSelect: (result: StopSearchResult) => void;
  onNavigate: (result: StopSearchResult, e: React.MouseEvent) => void;
}

export default function SearchResultItem({
  result,
  isSelected = false,
  onSelect,
  onNavigate,
}: SearchResultItemProps) {
  // Mode-based icon rendering
  const renderModeIcon = () => {
    const mode = (result.mode || '').toLowerCase();
    if (mode.includes('train') || mode.includes('rail')) {
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="16" x="4" y="3" rx="2" />
          <path d="M4 11h16" />
          <path d="M12 3v8" />
          <path d="m8 19-2 3" />
          <path d="m18 22-2-3" />
          <circle cx="8" cy="15" r="1" />
          <circle cx="16" cy="15" r="1" />
        </svg>
      );
    }
    if (mode.includes('tram')) {
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="16" x="4" y="4" rx="2" />
          <path d="M4 10h16" />
          <path d="M12 4v6" />
          <circle cx="8" cy="15" r="1" />
          <circle cx="16" cy="15" r="1" />
          <path d="m8 20-2 2" />
          <path d="m18 22-2-2" />
          <path d="M12 1v3" />
        </svg>
      );
    }
    if (mode.includes('bus')) {
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6v6" />
          <path d="M15 6v6" />
          <path d="M2 12h19.6" />
          <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
          <circle cx="7" cy="18" r="2" />
          <path d="M9 18h5" />
          <circle cx="16" cy="18" r="2" />
        </svg>
      );
    }
    if (mode.includes('campus') || mode.includes('university') || mode.includes('college')) {
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5" />
        </svg>
      );
    }
    if (mode.includes('building') || mode.includes('landmark')) {
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
          <path d="M9 22v-4h6v4" />
          <path d="M8 6h.01" />
          <path d="M16 6h.01" />
          <path d="M12 6h.01" />
          <path d="M12 10h.01" />
          <path d="M12 14h.01" />
          <path d="M16 10h.01" />
          <path d="M16 14h.01" />
          <path d="M8 10h.01" />
          <path d="M8 14h.01" />
        </svg>
      );
    }
    // Default location pin icon
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
  };

  const modeBadge = result.mode || 'Transit Stop';
  const lowerMode = modeBadge.toLowerCase();

  const getBadgeStyle = () => {
    if (lowerMode.includes('train')) {
      return 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30';
    }
    if (lowerMode.includes('tram')) {
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    }
    if (lowerMode.includes('bus')) {
      return 'bg-accent-amber/15 text-accent-amber border border-accent-amber/30';
    }
    if (lowerMode.includes('campus')) {
      return 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30';
    }
    if (lowerMode.includes('building') || lowerMode.includes('landmark')) {
      return 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
    }
    return 'bg-slate-700/30 text-slate-300 border border-slate-600/40';
  };

  const getIconWrapperStyle = () => {
    if (lowerMode.includes('train')) {
      return 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan group-hover:border-accent-cyan/70';
    }
    if (lowerMode.includes('tram')) {
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/70';
    }
    if (lowerMode.includes('bus')) {
      return 'border-accent-amber/40 bg-accent-amber/10 text-accent-amber group-hover:border-accent-amber/70';
    }
    if (lowerMode.includes('campus')) {
      return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 group-hover:border-indigo-500/70';
    }
    if (lowerMode.includes('building') || lowerMode.includes('landmark')) {
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300 group-hover:border-rose-500/70';
    }
    return 'border-subtle bg-surface-elevated text-secondary group-hover:border-glow';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(result)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(result);
        }
      }}
      className={`group relative flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all duration-200 cursor-pointer ${isSelected
          ? 'border-accent-cyan/60 bg-accent-cyan/10 shadow-[0_0_16px_rgba(56,189,248,0.2)]'
          : 'border-subtle bg-surface-elevated/70 hover:border-accent-cyan/40 hover:bg-surface-hover hover:shadow-subtle'
        }`}
    >
      {/* Left: Mode Icon + Stop Details */}
      <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${getIconWrapperStyle()}`}
        >
          {renderModeIcon()}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          {/* Primary: Building or Station Name */}
          <span className="truncate font-sans text-[0.88rem] font-semibold text-primary group-hover:text-accent-cyan transition-colors">
            {result.stop_name}
          </span>

          {/* Secondary: Street Name & Specific Transit Type */}
          <div className="flex items-center gap-2 mt-0.5 overflow-hidden">
            <span
              className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider ${getBadgeStyle()}`}
            >
              {modeBadge}
            </span>

            {result.street_name && (
              <span className="truncate font-sans text-[0.74rem] text-secondary">
                {result.street_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Navigate Button */}
      <div className="shrink-0 pl-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(result, e);
          }}
          title={`Navigate to ${result.stop_name}`}
          className="group/btn relative flex items-center gap-1.5 rounded-full border border-accent-cyan/50 bg-linear-to-r from-accent-cyan/20 to-accent-indigo/20 px-3.5 py-1.5 font-display text-[0.75rem] font-bold text-accent-cyan shadow-sm transition-all duration-200 hover:border-accent-cyan hover:from-accent-cyan hover:to-accent-indigo hover:text-deep hover:shadow-[0_0_16px_rgba(56,189,248,0.4)] active:scale-95 cursor-pointer"
        >
          <svg
            className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <polygon points="12 2 19 21 12 17 5 21 12 2" />
          </svg>
          <span className="tracking-wide">Navigate</span>
        </button>
      </div>
    </div>
  );
}
