import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { RouteMetadata, RouteStop } from '../../services/api';

export type TransitMode = 'train' | 'tram' | 'bus';

export const MODE_CONFIG: Record<
  TransitMode,
  {
    label: string;
    singular: string;
    title: string;
    color: string;
    glow: string;
    icon: (props?: { className?: string; size?: number }) => React.ReactElement;
    categories: string[];
  }
> = {
  train: {
    label: 'Trains',
    singular: 'Train',
    title: 'Metro Trains',
    color: '#0072CE',
    glow: 'rgba(0, 114, 206, 0.45)',
    icon: ({ className = '', size = 18 } = {}) => (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="4" y="3" width="16" height="14" rx="4" />
        <path d="M4 10h16" />
        <path d="M8 21l1.5-3.5" />
        <path d="M16 21l-1.5-3.5" />
        <circle cx="8" cy="14" r="1" fill="currentColor" />
        <circle cx="16" cy="14" r="1" fill="currentColor" />
      </svg>
    ),
    categories: ['All', 'City Loop', 'Burnley', 'Northern', 'Clifton Hill', 'Frankston', 'Cross-City']
  },
  tram: {
    label: 'Trams',
    singular: 'Tram',
    title: 'Yarra Trams',
    color: '#78BE20',
    glow: 'rgba(120, 190, 32, 0.45)',
    icon: ({ className = '', size = 18 } = {}) => (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M9 3v2M15 3v2" />
        <rect x="3" y="5" width="18" height="13" rx="3" />
        <path d="M3 11h18" />
        <path d="M7 21l1.2-3M17 21l-1.2-3" />
        <circle cx="7.5" cy="15" r="0.8" fill="currentColor" />
        <circle cx="16.5" cy="15" r="0.8" fill="currentColor" />
      </svg>
    ),
    categories: ['All', 'City Corridors', 'St Kilda / South', 'North / West', 'East']
  },
  bus: {
    label: 'Buses',
    singular: 'Bus',
    title: 'PTV Buses',
    color: '#FF8200',
    glow: 'rgba(255, 130, 0, 0.45)',
    icon: ({ className = '', size = 18 } = {}) => (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <rect x="3" y="4" width="18" height="13" rx="3" />
        <path d="M3 11h18" />
        <path d="M7 20v-3M17 20v-3" />
        <circle cx="7.5" cy="17" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="17" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
    categories: ['All', 'SmartBus / Orbital', 'Frequent & University', 'Metro Grid']
  }
};

const MODES: TransitMode[] = ['train', 'tram', 'bus'];

interface TransitExplorerProps {
  isOpen: boolean;
  activeMode: TransitMode;
  selectedRouteMode?: TransitMode | null;
  onChangeMode: (mode: TransitMode) => void;
  routes: RouteMetadata[];
  isLoading: boolean;
  selectedRouteShortName?: string | null;
  activeStops?: RouteStop[];
  isLoadingStops?: boolean;
  nearestVehicle?: {
    coords: [number, number];
    distanceLabel: string;
  } | null;
  liveTrainCounts?: Record<string, number>;
  onSelectRoute: (mode: TransitMode, route: RouteMetadata) => void;
  onFitRoute: () => void;
  onFlyToVehicle?: () => void;
  onFlyToStop: (stop: RouteStop) => void;
  onNavigateToStop: (stop: RouteStop) => void;
  onClearRoute: () => void;
  onClose: () => void;
}

export default function TransitExplorer({
  isOpen,
  activeMode,
  selectedRouteMode,
  onChangeMode,
  routes,
  isLoading,
  selectedRouteShortName,
  activeStops = [],
  isLoadingStops = false,
  nearestVehicle,
  liveTrainCounts = {},
  onSelectRoute,
  onFitRoute,
  onFlyToVehicle,
  onFlyToStop,
  onNavigateToStop,
  onClearRoute,
  onClose
}: TransitExplorerProps) {
  const [filterText, setFilterText] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const config = MODE_CONFIG[activeMode];

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 150);
    } else {
      setFilterText('');
      setActiveCategory('All');
    }
  }, [isOpen, activeMode]);

  // Handle clicking mode in sidebar nav rail
  const handleRailModeClick = (mode: TransitMode) => {
    if (activeMode === mode) {
      onClose();
    } else {
      onChangeMode(mode);
      setActiveCategory('All');
      setFilterText('');
    }
  };

  // Filter routes based on search text and active category
  const filteredRoutes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return routes.filter((route) => {
      // Remove lines with no trains / inactive lines
      if (activeMode === 'train') {
        if (['Flemington Racecourse', 'City Circle', 'Replacement Bus', 'Williamstown', 'Stony Point'].includes(route.route_short_name)) {
          return false;
        }
      }

      // Text match
      const matchesText =
        !q ||
        route.route_short_name.toLowerCase().includes(q) ||
        route.route_long_name.toLowerCase().includes(q) ||
        (route.group && route.group.toLowerCase().includes(q));

      if (!matchesText) return false;

      // Category match
      if (activeCategory === 'All') return true;

      if (activeMode === 'train') {
        const group = route.group || '';
        return group.toLowerCase().includes(activeCategory.toLowerCase());
      }

      if (activeMode === 'tram') {
        const num = parseInt(route.route_short_name, 10);
        if (activeCategory === 'City Corridors') {
          return [96, 86, 19, 109, 11, 12, 1, 35].includes(num);
        }
        if (activeCategory === 'St Kilda / South') {
          return [16, 96, 3, 6, 72, 67, 64].includes(num);
        }
        if (activeCategory === 'North / West') {
          return [19, 58, 59, 57, 82].includes(num);
        }
        if (activeCategory === 'East') {
          return [70, 75, 48, 109, 78].includes(num);
        }
      }

      if (activeMode === 'bus') {
        if (activeCategory === 'SmartBus / Orbital') {
          return route.route_short_name.startsWith('90');
        }
        if (activeCategory === 'Frequent & University') {
          return ['401', '601', '302', '304', '200', '201', '207', '301'].includes(route.route_short_name);
        }
        if (activeCategory === 'Metro Grid') {
          return !route.route_short_name.startsWith('90');
        }
      }

      return true;
    });
  }, [routes, filterText, activeCategory, activeMode]);

  return (
    <>

      <aside
        id="transit-explorer-panel"
        role="dialog"
        aria-label="Transit Explorer"
        className={`pointer-events-auto fixed inset-y-0 left-0 z-50 flex w-[480px] max-w-full flex-row border-r border-subtle bg-surface-elevated/95 shadow-2xl backdrop-blur-2xl transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        style={{
          transitionDuration: '320ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow: isOpen
            ? `16px 0 48px -8px rgba(0, 0, 0, 0.7), 4px 0 24px -4px ${config.glow}`
            : undefined
        }}
      >
        {/* Integrated Left Nav Rail (Column 1) */}
        <div className="flex w-[62px] shrink-0 flex-col items-center justify-between border-r border-subtle/60 bg-surface/50 py-4 max-[768px]:w-[54px] max-[768px]:py-3">
          {/* Top: Back / Collapse Button */}
          <div className="flex flex-col items-center">
            <button
              id="transit-explorer-back-btn"
              onClick={onClose}
              aria-label="Back to map"
              title="Back to map (Esc)"
              className="group relative flex h-10 w-10 items-center justify-center rounded-2xl border border-subtle bg-surface/80 text-secondary transition-all hover:border-white/20 hover:bg-surface-hover hover:text-primary active:scale-95"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>

              {/* Hover Tooltip */}
              <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl border border-subtle bg-surface-elevated/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-glass backdrop-blur-md group-hover:block max-[768px]:hidden z-50">
                Back to map (Esc)
              </span>
            </button>
          </div>

          {/* Center: Transit Modes Navigation */}
          <div className="flex flex-col items-center gap-2">
            {MODES.map((mode) => {
              const mConfig = MODE_CONFIG[mode];
              const Icon = mConfig.icon;
              const isActive = activeMode === mode;

              return (
                <button
                  key={mode}
                  id={`sidebar-mode-${mode}`}
                  onClick={() => handleRailModeClick(mode)}
                  title={isActive ? `Close ${mConfig.label}` : `Switch to ${mConfig.label}`}
                  aria-label={isActive ? `Close ${mConfig.label}` : `Switch to ${mConfig.label}`}
                  className="group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-200"
                  style={{
                    color: isActive ? mConfig.color : 'var(--color-secondary)',
                    backgroundColor: isActive ? `${mConfig.color}25` : 'transparent',
                    border: isActive ? `1.5px solid ${mConfig.color}80` : '1.5px solid transparent'
                  }}
                >
                  <Icon size={19} />

                  {/* Hover Tooltip */}
                  <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl border border-subtle bg-surface-elevated/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-glass backdrop-blur-md group-hover:block max-[768px]:hidden z-50">
                    {mConfig.label}
                  </span>
                </button>
              );
            })}
          </div>

        {/* Bottom: Clear Route / Status Indicator */}
        <div className="flex flex-col items-center gap-1.5">
          {selectedRouteShortName ? (
            <button
              onClick={onClearRoute}
              title="Clear route highlight"
              aria-label="Clear route highlight"
              className="group relative flex h-9 w-9 items-center justify-center rounded-xl border border-subtle bg-surface/60 text-secondary transition-all hover:bg-surface-hover hover:text-rose-400 active:scale-95"
            >
              <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl border border-subtle bg-surface-elevated/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-glass backdrop-blur-md group-hover:block max-[768px]:hidden z-50">
                Clear route
              </span>
            </button>
          ) : (
            <span
              className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"
              title="PTV Network Live"
            />
          )}
        </div>
      </div>

      {/* Right Sidebar Content Area (Column 2) */}
      <div className="flex flex-1 flex-col min-w-0 bg-transparent overflow-hidden">
        {/* Content Header */}
        <div className="flex items-center justify-between border-b border-subtle/60 px-4 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-colors"
              style={{ backgroundColor: config.color }}
            >
              {config.icon({ size: 16 })}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-sm font-bold text-primary tracking-tight">
                {config.title}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] font-semibold tracking-wider text-secondary uppercase">
                  PTV Network
                </span>
                <span className="text-secondary/40">•</span>
                <span className="text-[10px] text-secondary">
                  {filteredRoutes.length} {config.label.toLowerCase()}
                </span>
              </div>
            </div>
          </div>

          <button
            id="transit-explorer-close-btn"
            onClick={onClose}
            aria-label="Close Transit Explorer"
            title="Close (Esc)"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface/60 text-secondary transition-all hover:bg-surface-hover hover:text-primary active:scale-95"
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Instant Search Bar */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative flex items-center rounded-xl border border-subtle bg-surface/60 px-3 py-2 transition-all focus-within:border-accent-cyan/60 focus-within:bg-surface/90">
            <svg
              viewBox="0 0 24 24"
              width={15}
              height={15}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="shrink-0 text-secondary"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchInputRef}
              id="transit-route-search-input"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={`Search ${config.singular.toLowerCase()} lines, numbers, or destinations...`}
              className="ml-2 w-full bg-transparent font-sans text-xs text-primary placeholder:text-secondary/60 outline-none"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="text-secondary transition-colors hover:text-primary"
                aria-label="Clear route search"
              >
                <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5">
          {config.categories.map((cat) => {
            const isCatActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all duration-150"
                style={{
                  backgroundColor: isCatActive ? `${config.color}30` : 'rgba(255, 255, 255, 0.04)',
                  color: isCatActive ? config.color : 'var(--color-secondary)',
                  border: isCatActive ? `1px solid ${config.color}70` : '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Route Cards Container */}
        <div
          key={activeMode}
          className="relative flex-1 overflow-y-auto px-4 py-2"
          style={{
            animation: 'transitModeCrossFade 150ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="flex h-16 w-full animate-pulse items-center gap-3 rounded-2xl border border-subtle bg-surface/40 p-3"
              >
                <div className="h-8 w-14 rounded-xl bg-surface-elevated/80" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/3 rounded bg-surface-elevated/80" />
                  <div className="h-2.5 w-1/3 rounded bg-surface-elevated/50" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface/60 text-secondary">
              <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <p className="font-display text-sm font-semibold text-primary">No routes found</p>
            <p className="mt-1 text-xs text-secondary">
              Try adjusting your search query or selected category
            </p>
            {(filterText || activeCategory !== 'All') && (
              <button
                onClick={() => {
                  setFilterText('');
                  setActiveCategory('All');
                }}
                className="mt-3 rounded-xl border border-subtle bg-surface/60 px-3 py-1.5 text-xs font-medium text-accent-cyan transition-colors hover:bg-surface-hover"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredRoutes.map((route) => {
              const isSelected = selectedRouteShortName === route.route_short_name;
              const routeColor = route.color || config.color;
              const liveCount = liveTrainCounts[route.route_short_name];

              return (
                <div
                  key={`${route.route_id}-${route.route_short_name}`}
                  className={`group relative flex flex-col rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isSelected
                      ? 'border-accent-cyan/80 bg-surface-hover/95 shadow-lg'
                      : 'border-subtle bg-surface/40 hover:border-white/20 hover:bg-surface-hover/60'
                  }`}
                  style={{
                    boxShadow: isSelected ? `0 0 24px -4px ${routeColor}66` : undefined
                  }}
                >
                  {/* Route Card Header Button */}
                  <button
                    onClick={() => onSelectRoute(activeMode, route)}
                    className="flex w-full items-center gap-3.5 p-3 text-left focus:outline-none"
                    aria-expanded={isSelected}
                  >
                    {/* Route Badge */}
                    <div
                      className={`flex min-w-[50px] shrink-0 items-center justify-center rounded-xl px-2.5 py-1.5 font-display text-xs font-bold shadow-sm transition-transform ${
                        route.outline || route.route_short_name === 'Stony Point'
                          ? 'border-2 bg-emerald-500/10'
                          : ''
                      }`}
                      style={
                        route.outline || route.route_short_name === 'Stony Point'
                          ? { borderColor: routeColor, color: routeColor }
                          : { backgroundColor: routeColor, color: route.text_color || '#FFFFFF' }
                      }
                    >
                      {route.route_short_name}
                    </div>

                    {/* Route Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-xs font-bold text-primary group-hover:text-accent-cyan transition-colors">
                          {route.route_short_name} {activeMode === 'train' ? 'Line' : ''}
                        </span>
                        {(route.shuttle || route.route_short_name === 'Stony Point') && (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400">
                            Shuttle
                          </span>
                        )}
                      </div>

                      <p className="truncate text-[11px] text-secondary">
                        {route.route_long_name || `${config.singular} Service`}
                      </p>

                      {route.group && (
                        <span className="mt-0.5 inline-block text-[10px] font-medium text-secondary/70">
                          {route.group}
                        </span>
                      )}
                    </div>

                    {/* Live Vehicle Count Badge (replacing the dropdown arrow) */}
                    {liveCount !== undefined && liveCount > 0 && (
                      <div className="shrink-0">
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {liveCount} {liveCount === 1 ? 'train' : 'trains'}
                        </span>
                      </div>
                    )}
                  </button>

                  {/* Inline Route Dropdown Content (Accordion) */}
                  {isSelected && (
                    <div className="border-t border-subtle bg-surface/80 p-3 pt-2.5 text-xs space-y-2.5">
                      {/* Action toolbar */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onFitRoute();
                          }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-subtle bg-surface/80 py-1.5 text-[11px] font-semibold text-secondary transition-all hover:bg-surface-hover hover:text-primary"
                        >
                          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                          </svg>
                          Fit on Map
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onClearRoute();
                          }}
                          className="flex items-center justify-center gap-1 rounded-xl border border-subtle bg-surface/80 px-2.5 py-1.5 text-[11px] font-semibold text-secondary transition-all hover:bg-surface-hover hover:text-rose-400"
                        >
                          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                          Clear
                        </button>
                      </div>

                      {/* Live Train Tracker Banner (if nearest vehicle exists) */}
                      {nearestVehicle && onFlyToVehicle && (
                        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[11px] text-primary/90">
                              Nearest: <strong>{nearestVehicle.distanceLabel}</strong> away
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onFlyToVehicle();
                            }}
                            className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                          >
                            Track
                          </button>
                        </div>
                      )}

                      {/* Stops List Timeline */}
                      <div className="pt-1">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-secondary uppercase tracking-wider">
                            Route Stops {activeStops && activeStops.length > 0 ? `(${activeStops.length})` : ''}
                          </span>
                          <span className="text-[10px] text-secondary/60">
                            Tap to fly to stop
                          </span>
                        </div>

                        {isLoadingStops ? (
                          <div className="flex items-center justify-center py-4 text-[11px] text-secondary">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent mr-2" />
                            Loading stations...
                          </div>
                        ) : !activeStops || activeStops.length === 0 ? (
                          <p className="py-2 text-center text-[11px] text-secondary">
                            No stops schedule available.
                          </p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto rounded-xl border border-subtle bg-surface/50 p-2 space-y-1.5">
                            {activeStops.map((stop, sIdx) => {
                              const isFirst = sIdx === 0;
                              const isLast = sIdx === activeStops.length - 1;

                              return (
                                <div
                                  key={`${stop.stop_id}-${sIdx}`}
                                  className="group/stop flex items-center justify-between rounded-lg px-2 py-1 hover:bg-surface-hover/70 transition-colors"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onFlyToStop(stop);
                                    }}
                                    className="flex flex-1 items-center gap-2 text-left min-w-0 focus:outline-none"
                                  >
                                    <span
                                      className={`h-2 w-2 rounded-full shrink-0 ${
                                        isFirst || isLast ? 'ring-2 ring-white/50' : ''
                                      }`}
                                      style={{ backgroundColor: isFirst || isLast ? '#ffffff' : routeColor }}
                                    />
                                    <span className="truncate text-[11px] font-medium text-primary group-hover/stop:text-accent-cyan transition-colors">
                                      {stop.stop_name}
                                    </span>
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onNavigateToStop(stop);
                                    }}
                                    title={`Navigate to ${stop.stop_name}`}
                                    className="ml-1 shrink-0 text-secondary opacity-50 hover:opacity-100 hover:text-accent-cyan transition-all"
                                  >
                                    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
                                      <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between border-t border-subtle bg-surface/40 px-4 py-2.5 text-[11px] text-secondary">
          <span>
            Showing <strong className="text-primary">{filteredRoutes.length}</strong> {config.label.toLowerCase()}
          </span>
          <span className="font-mono text-[10px] text-secondary/60">
            Esc to close
          </span>
        </div>
      </div>
    </aside>

    <style>{`
      @keyframes transitModeCrossFade {
        from {
          opacity: 0;
          transform: translateY(3px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `}</style>
  </>
  );
}
