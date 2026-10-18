import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { RouteMetadata, RouteStop, LiveVehicle } from '../../services/api';
import SidebarSettingsView from './SidebarSettingsView';

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
  sidebarView?: 'transit' | 'settings';
  onToggleSettings?: () => void;
  selectedRouteMode?: TransitMode | null;
  onChangeMode: (mode: TransitMode) => void;
  routes: RouteMetadata[];
  isLoading: boolean;
  selectedRouteShortName?: string | null;
  activeStops?: RouteStop[];
  isLoadingStops?: boolean;
  activeVehicles?: LiveVehicle[];
  highlightedTripId?: string | null;
  nearestVehicle?: {
    coords: [number, number];
    distanceLabel: string;
  } | null;
  liveTrainCounts?: Record<string, number>;
  onSelectRoute: (mode: TransitMode, route: RouteMetadata) => void;
  onTrackVehicle?: (vehicle: LiveVehicle) => void;
  onFlyToVehicle?: () => void;
  onFlyToStop: (stop: RouteStop) => void;
  onNavigateToStop: (stop: RouteStop) => void;
  onClearRoute: () => void;
  onClose: () => void;
}

/** Computes great-circle distance between two GPS coordinates in meters */
function distMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Computes shortest distance from point P to line segment AB in meters */
function distToSegmentMeters(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const cosLat = Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  const px = (pLon - aLon) * cosLat;
  const py = pLat - aLat;
  const bx = (bLon - aLon) * cosLat;
  const by = bLat - aLat;
  const l2 = bx * bx + by * by;
  if (l2 === 0) return distMeters(pLat, pLon, aLat, aLon);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / l2));
  const projLon = aLon + t * (bLon - aLon);
  const projLat = aLat + t * (bLat - aLat);
  return distMeters(pLat, pLon, projLat, projLon);
}

interface CorrelatedCorridorVehicles {
  stoppedVehiclesMap: Record<number, LiveVehicle[]>;
  inTransitVehiclesMap: Record<number, LiveVehicle[]>;
}

function mapVehiclesToCorridor(
  stops: RouteStop[],
  vehicles: LiveVehicle[]
): CorrelatedCorridorVehicles {
  const stoppedVehiclesMap: Record<number, LiveVehicle[]> = {};
  const inTransitVehiclesMap: Record<number, LiveVehicle[]> = {};

  if (!stops || stops.length === 0 || !vehicles || vehicles.length === 0) {
    return { stoppedVehiclesMap, inTransitVehiclesMap };
  }

  const defaultDownDest = stops[stops.length - 1].stop_name;
  const defaultUpDest = stops[0].stop_name;

  for (const v of vehicles) {
    let assigned = false;

    // 1. Explicit ID / Name check first
    const sNameClean = v.current_stop_name?.toLowerCase();
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (
        v.is_stopped &&
        (v.current_stop_id === stop.stop_id ||
          (sNameClean && stop.stop_name.toLowerCase() === sNameClean))
      ) {
        if (!stoppedVehiclesMap[i]) stoppedVehiclesMap[i] = [];
        stoppedVehiclesMap[i].push(v);
        assigned = true;
        break;
      }
    }

    if (assigned) continue;

    // Check explicit segment
    const fromN = v.from_stop_name?.toLowerCase();
    const toN = v.to_stop_name?.toLowerCase();
    if (!v.is_stopped && (fromN || v.from_stop_id)) {
      for (let i = 0; i < stops.length - 1; i++) {
        const s1 = stops[i];
        const s2 = stops[i + 1];
        const s1Name = s1.stop_name.toLowerCase();
        const s2Name = s2.stop_name.toLowerCase();
        if (
          (fromN === s1Name && toN === s2Name) ||
          (fromN === s2Name && toN === s1Name) ||
          (v.from_stop_id === s1.stop_id && v.to_stop_id === s2.stop_id) ||
          (v.from_stop_id === s2.stop_id && v.to_stop_id === s1.stop_id)
        ) {
          if (!inTransitVehiclesMap[i]) inTransitVehiclesMap[i] = [];
          inTransitVehiclesMap[i].push(v);
          assigned = true;
          break;
        }
      }
    }

    if (assigned) continue;

    // 2. Spatial GPS matching fallback
    if (v.lat === undefined || v.lon === undefined) continue;

    // Find closest stop
    let minStopDist = Infinity;
    let closestStopIdx = 0;
    for (let i = 0; i < stops.length; i++) {
      const d = distMeters(v.lat, v.lon, stops[i].stop_lat, stops[i].stop_lon);
      if (d < minStopDist) {
        minStopDist = d;
        closestStopIdx = i;
      }
    }

    // Station dwell threshold: if vehicle is stopped (or within 400m station sphere)
    if (v.is_stopped || minStopDist <= 400) {
      if (minStopDist <= 1500 || v.is_stopped) {
        if (!stoppedVehiclesMap[closestStopIdx]) stoppedVehiclesMap[closestStopIdx] = [];
        const enriched: LiveVehicle = {
          ...v,
          is_stopped: true,
          current_stop_id: stops[closestStopIdx].stop_id,
          current_stop_name: stops[closestStopIdx].stop_name,
          destination: v.destination || (v.direction_id === 1 ? defaultUpDest : defaultDownDest)
        };
        stoppedVehiclesMap[closestStopIdx].push(enriched);
        continue;
      }
    }

    // If moving or not matched to station, find best segment along corridor
    if (stops.length >= 2) {
      let minSegDist = Infinity;
      let bestSegIdx = 0;
      for (let i = 0; i < stops.length - 1; i++) {
        const segDist = distToSegmentMeters(
          v.lat,
          v.lon,
          stops[i].stop_lat,
          stops[i].stop_lon,
          stops[i + 1].stop_lat,
          stops[i + 1].stop_lon
        );
        if (segDist < minSegDist) {
          minSegDist = segDist;
          bestSegIdx = i;
        }
      }

      // Infer downstream heading from segment orientation vs bearing
      const s1 = stops[bestSegIdx];
      const s2 = stops[bestSegIdx + 1];
      const segBearing =
        ((Math.atan2(s2.stop_lon - s1.stop_lon, s2.stop_lat - s1.stop_lat) * 180) / Math.PI + 360) % 360;
      const bearingDiff = Math.abs((v.bearing_deg || 0) - segBearing);
      const isDown = bearingDiff < 90 || bearingDiff > 270;

      const enriched: LiveVehicle = {
        ...v,
        from_stop_name: isDown ? s1.stop_name : s2.stop_name,
        to_stop_name: isDown ? s2.stop_name : s1.stop_name,
        from_stop_id: isDown ? s1.stop_id : s2.stop_id,
        to_stop_id: isDown ? s2.stop_id : s1.stop_id,
        direction_id: isDown ? 0 : 1,
        destination: v.destination || (isDown ? defaultDownDest : defaultUpDest)
      };

      if (!inTransitVehiclesMap[bestSegIdx]) inTransitVehiclesMap[bestSegIdx] = [];
      inTransitVehiclesMap[bestSegIdx].push(enriched);
    }
  }

  return { stoppedVehiclesMap, inTransitVehiclesMap };
}

export default function TransitExplorer({
  isOpen,
  activeMode,
  sidebarView = 'transit',
  onToggleSettings,
  selectedRouteMode,
  onChangeMode,
  routes,
  isLoading,
  selectedRouteShortName,
  activeStops = [],
  isLoadingStops = false,
  activeVehicles = [],
  highlightedTripId = null,
  nearestVehicle,
  liveTrainCounts = {},
  onSelectRoute,
  onTrackVehicle,
  onFlyToVehicle,
  onFlyToStop,
  onNavigateToStop,
  onClearRoute,
  onClose
}: TransitExplorerProps) {
  const [filterText, setFilterText] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const highlightedVehicleRef = useRef<HTMLButtonElement | null>(null);
  const config = MODE_CONFIG[activeMode];

  const { stoppedVehiclesMap, inTransitVehiclesMap } = useMemo(() => {
    return mapVehiclesToCorridor(activeStops, activeVehicles);
  }, [activeStops, activeVehicles]);

  // Auto-scroll highlighted vehicle badge into view when selected
  useEffect(() => {
    if (highlightedTripId && highlightedVehicleRef.current) {
      highlightedVehicleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedTripId, activeVehicles]);

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
    if (sidebarView === 'transit' && activeMode === mode) {
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
        className={`pointer-events-auto fixed top-24 bottom-5 left-5 z-50 flex w-[480px] max-w-[calc(100vw-2.5rem)] flex-row overflow-hidden rounded-3xl border border-subtle bg-surface-elevated/95 shadow-glass backdrop-blur-2xl transition-all duration-300 max-[768px]:top-[76px] max-[768px]:bottom-3 max-[768px]:left-3 max-[768px]:max-w-[calc(100vw-1.5rem)] ${
          isOpen
            ? 'translate-x-0 opacity-100 pointer-events-auto'
            : '-translate-x-full opacity-0 pointer-events-none'
        }`}
        style={{
          boxShadow: isOpen
            ? `0 20px 48px -8px rgba(0, 0, 0, 0.7), 0 0 24px -4px ${
                sidebarView === 'settings' ? 'var(--color-glow)' : config.glow
              }`
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
              const isActive = sidebarView === 'transit' && activeMode === mode;

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

          {/* Bottom: Settings */}
          <div className="flex flex-col items-center gap-2">
            {/* Settings button in the sidebar rail */}
            <button
              id="sidebar-mode-settings"
              onClick={onToggleSettings}
              title={sidebarView === 'settings' ? 'Close Settings' : 'Studio Settings'}
              aria-label={sidebarView === 'settings' ? 'Close Settings' : 'Studio Settings'}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200 ${
                sidebarView === 'settings'
                  ? 'border border-accent-cyan/80 bg-accent-cyan/20 text-accent-cyan shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                  : 'border border-transparent text-secondary hover:bg-surface-hover hover:text-primary'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform duration-300 group-hover:rotate-45"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl border border-subtle bg-surface-elevated/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-glass backdrop-blur-md group-hover:block max-[768px]:hidden z-50">
                {sidebarView === 'settings' ? 'Close Settings' : 'Studio Settings'}
              </span>
            </button>
          </div>
        </div>

        {sidebarView === 'settings' ? (
          <SidebarSettingsView onClose={onClose} />
        ) : (
          /* Right Sidebar Content Area (Column 2) */
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
                    aria-label={`Toggle ${route.route_short_name} corridor`}
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
                          {activeMode === 'tram'
                            ? `Route ${route.route_short_name}`
                            : activeMode === 'train'
                            ? `${route.route_short_name} Line`
                            : route.route_short_name}
                        </span>
                      </div>

                      <p className="truncate text-[11px] text-secondary">
                        {route.route_long_name || `${config.singular} Service`}
                      </p>
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
                      {/* Stops List Corridor Timeline */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold text-secondary uppercase tracking-wider">
                            Corridor Stations {activeStops && activeStops.length > 0 ? `(${activeStops.length})` : ''}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-secondary/60">
                            Tap station to fly
                            <button
                              onClick={onClearRoute}
                              title="Clear route highlight"
                              aria-label="Clear route highlight"
                              className="flex h-4 w-4 items-center justify-center rounded-full text-secondary/60 transition-colors hover:text-rose-400"
                            >
                              <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {isLoadingStops ? (
                          <div className="flex items-center justify-center py-6 text-[11px] text-secondary">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent mr-2" />
                            Loading stations...
                          </div>
                        ) : !activeStops || activeStops.length === 0 ? (
                          <p className="py-3 text-center text-[11px] text-secondary">
                            No stops schedule available.
                          </p>
                        ) : (
                          <div
                            data-testid="corridor-stations-scroll"
                            className="max-h-[380px] overflow-y-auto pr-1.5 rounded-xl border border-subtle bg-surface/50 p-2.5 space-y-0 focus:outline-none"
                          >
                            {activeStops.map((stop, sIdx) => {
                              const isFirst = sIdx === 0;
                              const isLast = sIdx === activeStops.length - 1;

                              // Use correlated corridor vehicles (handles both explicit stop names and live GPS feeds)
                              const stoppedVehicles = stoppedVehiclesMap[sIdx] || [];
                              const inTransitVehicles = inTransitVehiclesMap[sIdx] || [];

                              const renderVehicleSymbol = (vehicle: LiveVehicle, isStoppedAtStation: boolean) => {
                                const s1 = vehicle.from_stop_name?.toLowerCase();
                                const s2 = vehicle.to_stop_name?.toLowerCase();
                                const fromIdx = activeStops.findIndex(
                                  (s) => s.stop_id === vehicle.from_stop_id || (s1 && s.stop_name.toLowerCase() === s1)
                                );
                                const toIdx = activeStops.findIndex(
                                  (s) => s.stop_id === vehicle.to_stop_id || (s2 && s.stop_name.toLowerCase() === s2)
                                );
                                const isDown =
                                  vehicle.direction_id !== undefined
                                    ? vehicle.direction_id === 0
                                    : toIdx !== -1 && fromIdx !== -1
                                    ? toIdx > fromIdx
                                    : true;
                                const isHighlighted = highlightedTripId === vehicle.trip_id;
                                const defaultDownDest = activeStops[activeStops.length - 1]?.stop_name;
                                const defaultUpDest = activeStops[0]?.stop_name;
                                const destination =
                                  vehicle.destination ||
                                  vehicle.to_stop_name ||
                                  (isDown ? defaultDownDest : defaultUpDest) ||
                                  'Terminal';

                                return (
                                  <div key={vehicle.trip_id} className="group/sym relative flex items-center justify-center">
                                    <button
                                      id={`vehicle-badge-${vehicle.trip_id}`}
                                      data-testid={`vehicle-badge-${vehicle.trip_id}`}
                                      ref={isHighlighted ? highlightedVehicleRef : null}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (onTrackVehicle) {
                                          onTrackVehicle(vehicle);
                                        } else if (onFlyToVehicle) {
                                          onFlyToVehicle();
                                        } else {
                                          onFlyToStop({
                                            stop_id: vehicle.current_stop_id || '',
                                            stop_name: vehicle.current_stop_name || destination,
                                            full_name: '',
                                            stop_lat: vehicle.lat,
                                            stop_lon: vehicle.lon,
                                            stop_sequence: 0
                                          });
                                        }
                                      }}
                                      aria-label={`Live ${config.singular} to ${destination} - Click for 3D Chase View`}
                                      title={`Live ${config.singular} to ${destination} - Click for 3D Chase View`}
                                      className={`relative z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-md transition-all duration-200 cursor-pointer active:scale-95 ${
                                        isHighlighted
                                          ? 'bg-accent-cyan text-slate-950 ring-4 ring-accent-cyan/40 scale-110 shadow-[0_0_14px_rgba(56,189,248,0.8)]'
                                          : 'bg-surface-elevated text-emerald-400 border-2 border-emerald-400 hover:scale-110 hover:border-emerald-300'
                                      }`}
                                    >
                                      {/* Direction Arrow glyph */}
                                      <span className="font-bold text-[10px] leading-none select-none">
                                        {isDown ? '▼' : '▲'}
                                      </span>

                                      {/* Screen-reader accessible destination content */}
                                      <span className="sr-only">To {destination}</span>
                                    </button>

                                    {/* Floating Hover Card / Tooltip */}
                                    <div className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-lg border border-subtle bg-surface-elevated/95 px-2 py-1 text-[10px] font-semibold text-primary shadow-xl backdrop-blur-md group-hover/sym:flex items-center gap-1.5 z-30">
                                      <span className="text-secondary">{config.icon({ size: 10 })}</span>
                                      <span className="text-emerald-400 font-bold">{isDown ? '▼' : '▲'}</span>
                                      <span>To {destination}</span>
                                      {isStoppedAtStation && (
                                        <span className="text-[9px] rounded bg-white/10 px-1 py-0.2 text-secondary uppercase tracking-wider">
                                          At Stop
                                        </span>
                                      )}
                                      <span className="text-[9px] text-accent-cyan/90 font-mono">3D Chase</span>
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div key={`${stop.stop_id}-${sIdx}`} className="flex flex-col">
                                  {/* Station Node and Title Row */}
                                  <div className="group/stop flex items-center min-h-[34px] hover:bg-surface-hover/50 rounded-lg pr-2 transition-colors">
                                    {/* Track Column (32px wide) with centered vertical line and station dot */}
                                    <div className="relative w-8 shrink-0 self-stretch flex items-center justify-center">
                                      {/* Top line (from top of row to center) */}
                                      {!isFirst && (
                                        <span
                                          className="absolute top-0 bottom-1/2 left-1/2 -translate-x-1/2 w-1"
                                          style={{ backgroundColor: routeColor }}
                                        />
                                      )}
                                      {/* Bottom line (from center to row bottom) */}
                                      {!isLast && (
                                        <span
                                          className="absolute top-1/2 bottom-0 left-1/2 -translate-x-1/2 w-1"
                                          style={{ backgroundColor: routeColor }}
                                        />
                                      )}

                                      {/* Station Dot or Stopped Vehicle Symbol */}
                                      {stoppedVehicles.length > 0 ? (
                                        <div className="relative z-10 flex items-center justify-center">
                                          {stoppedVehicles.map((veh) => renderVehicleSymbol(veh, true))}
                                        </div>
                                      ) : isFirst || isLast ? (
                                        <span
                                          className="relative z-10 h-3.5 w-3.5 rounded-full ring-2 ring-white/90 shadow-md"
                                          style={{ backgroundColor: routeColor }}
                                        />
                                      ) : (
                                        <span
                                          className="relative z-10 h-2.5 w-2.5 rounded-full border-2 bg-surface-elevated shadow-sm"
                                          style={{ borderColor: routeColor }}
                                        />
                                      )}
                                    </div>

                                    {/* Station Name & Navigate action */}
                                    <div className="flex-1 min-w-0 flex items-center justify-between pl-1.5 py-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onFlyToStop(stop);
                                        }}
                                        className="flex items-center text-left min-w-0 focus:outline-none"
                                      >
                                        <span
                                          className={`truncate text-xs group-hover/stop:text-accent-cyan transition-colors ${
                                            isFirst || isLast ? 'font-bold text-primary' : 'font-medium text-primary/90'
                                          }`}
                                        >
                                          {stop.stop_name}
                                        </span>
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onNavigateToStop(stop);
                                        }}
                                        title={`Navigate to ${stop.stop_name}`}
                                        className="ml-1 shrink-0 text-secondary opacity-30 hover:opacity-100 hover:text-accent-cyan transition-all p-1"
                                      >
                                        <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth={2}>
                                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Track Segment between this station and next station */}
                                  {!isLast && (
                                    <div className="flex items-center min-h-[26px]">
                                      {/* Track Column with continuous line and moving vehicle symbol on top */}
                                      <div className="relative w-8 shrink-0 self-stretch flex items-center justify-center min-h-[26px]">
                                        {/* Continuous vertical line connecting stations */}
                                        <span
                                          className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1"
                                          style={{ backgroundColor: routeColor }}
                                        />

                                        {/* Moving vehicle symbol(s) sitting directly on top of the line */}
                                        {inTransitVehicles.length > 0 && (
                                          <div className="relative z-20 flex flex-col items-center gap-1">
                                            {inTransitVehicles.map((veh) => renderVehicleSymbol(veh, false))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Subtle destination label next to moving vehicle symbol */}
                                      <div className="flex-1 min-w-0 pl-1.5 py-0.5">
                                        {inTransitVehicles.length > 0 && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-secondary/70 italic truncate">
                                              {inTransitVehicles.map((v) => `→ ${v.destination || 'Terminal'}`).join(', ')}
                                            </span>
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
      )}
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
