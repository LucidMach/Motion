import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motionApi, type RouteResponse, type RouteLeg, type StopSearchResult, getLegColor } from '../../services/api';
import type { LocationTelemetry, NavigateToEventDetail } from '../../types/events';

export default function NavigationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Origin & Destination State
  const [originText, setOriginText] = useState('My Location');
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [originSuggestions, setOriginSuggestions] = useState<StopSearchResult[]>([]);
  const [isSearchingOrigin, setIsSearchingOrigin] = useState(false);

  // Arrive By Time State (Default: 'latest')
  const [arriveByMode, setArriveByMode] = useState<'latest' | 'custom'>('latest');
  const [customArrivalTime, setCustomArrivalTime] = useState('');

  const [destination, setDestination] = useState<NavigateToEventDetail | null>(null);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Live GPS telemetry tracker
  const [telemetry, setTelemetry] = useState<LocationTelemetry | null>(null);

  const originInputRef = useRef<HTMLInputElement>(null);

  // Helper to format Date to HH:MM (24-hr)
  const formatTimeHHMM = (d: Date): string => {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Helper to parse 24-hr time into 12-hr parts with AM/PM
  const parse24To12 = (time24: string) => {
    if (!time24 || !time24.includes(':')) {
      const d = new Date();
      const h = d.getHours();
      return {
        hour12: String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'),
        minute: String(d.getMinutes()).padStart(2, '0'),
        isPM: h >= 12,
      };
    }
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = mStr ? mStr.slice(0, 2).padStart(2, '0') : '00';
    return {
      hour12: String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0'),
      minute: m,
      isPM: h >= 12,
    };
  };

  // Helper to convert 12-hr + PM to 24-hr string
  const format12To24 = (h12: number, min: number, isPM: boolean): string => {
    let h24 = h12 % 12;
    if (isPM) h24 += 12;
    return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  // Helper to add offset minutes to an existing "HH:MM" arrival time string
  const addMinutesToTime = (timeStr: string, offsetMins: number): string => {
    const baseDate = new Date();
    if (timeStr && timeStr.includes(':')) {
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      if (!isNaN(h) && !isNaN(m)) {
        baseDate.setHours(h, m, 0, 0);
      }
    }
    baseDate.setMinutes(baseDate.getMinutes() + offsetMins);
    return formatTimeHHMM(baseDate);
  };

  // 1. Listen for Location Telemetry updates
  useEffect(() => {
    const handleLocation = (e: Event) => {
      const loc = (e as CustomEvent<LocationTelemetry>).detail;
      if (loc) {
        setTelemetry(loc);
        if (originText === 'My Location' || !originCoords) {
          setOriginCoords([loc.longitude, loc.latitude]);
        }
      }
    };

    window.addEventListener('motion:location', handleLocation);
    return () => {
      window.removeEventListener('motion:location', handleLocation);
    };
  }, [originText, originCoords]);

  // 2. Compute route between origin and destination
  const computeRoute = useCallback(
    async (
      origStr: string,
      origCoord: [number, number] | null,
      dest: NavigateToEventDetail,
      targetTimeParam?: string | null
    ) => {
      setIsLoading(true);
      setErrorMessage(null);

      // Determine origin string for API: coordinates or address name
      let originParam = origStr;
      if (origStr === 'My Location') {
        if (origCoord) {
          originParam = `${origCoord[1]},${origCoord[0]}`; // "lat,lon"
        } else if (telemetry) {
          originParam = `${telemetry.latitude},${telemetry.longitude}`;
        } else {
          originParam = '-37.8180,144.9671'; // Default Melbourne CBD Hub
        }
      }

      const destParam = `${dest.stop_lat},${dest.stop_lon}`;

      // Resolve arrival time:
      let arrivalTimeToSend: string | undefined = undefined;
      if (targetTimeParam !== undefined) {
        arrivalTimeToSend = targetTimeParam || undefined;
      } else if (arriveByMode === 'custom' && customArrivalTime) {
        arrivalTimeToSend = customArrivalTime;
      }

      try {
        const response = await motionApi.calculateRoute({
          origin: originParam,
          destination: destParam,
          arrival_time: arrivalTimeToSend,
          buffer_minutes: 5,
          prefer_replacement_bus: true,
          fetch_live_alerts: true,
        });

        if (response.status === 'Success') {
          setRoute(response);
          // Pre-populate time box with computed arrival time
          const arrivalTimeStr = response.legs.length > 0 
            ? response.legs[response.legs.length - 1].end_time 
            : (response.target_arrival_time ? response.target_arrival_time.split(' ')[1] : '');
          if (arrivalTimeStr) {
            setCustomArrivalTime(arrivalTimeStr);
          }

          // Dispatch plot-route command for map
          window.dispatchEvent(
            new CustomEvent('motion:cmd:plot-route', {
              detail: { route: response },
            })
          );
        } else {
          setRoute(null);
          setErrorMessage(response.message || 'Could not find a valid transit connection.');
        }
      } catch (err: any) {
        console.warn('[NavigationPanel] Routing error:', err);
        setRoute(null);
        setErrorMessage(err.message || 'Failed to calculate route. Please try another destination.');
      } finally {
        setIsLoading(false);
      }
    },
    [telemetry, arriveByMode, customArrivalTime]
  );

  // Handle setting arrival time preset or custom
  const handleSetArrivalTime = (mode: 'latest' | 'custom', offsetMins: number = 0, explicitTime?: string) => {
    if (mode === 'latest') {
      setArriveByMode('latest');
      if (destination) {
        computeRoute(originText, originCoords, destination, null);
      }
      return;
    }

    let timeStr = explicitTime;
    if (!timeStr) {
      // Base the offset on the current arrival time shown in the box or route arrival time
      const currentArrivalBase =
        customArrivalTime ||
        (route && route.legs.length > 0
          ? route.legs[route.legs.length - 1].end_time
          : formatTimeHHMM(new Date()));
      timeStr = addMinutesToTime(currentArrivalBase, offsetMins);
    }

    setArriveByMode('custom');
    setCustomArrivalTime(timeStr);
    if (destination) {
      computeRoute(originText, originCoords, destination, timeStr);
    }
  };

  // Handle toggling AM / PM explicitly
  const handleToggleAmPm = (targetPM: boolean) => {
    const { hour12, minute, isPM } = parse24To12(customArrivalTime);
    if (isPM === targetPM) return;
    const h12 = parseInt(hour12, 10) || 12;
    const m = parseInt(minute, 10) || 0;
    const new24 = format12To24(h12, m, targetPM);
    setCustomArrivalTime(new24);
    setArriveByMode('custom');
    if (destination) {
      computeRoute(originText, originCoords, destination, new24);
    }
  };

  // 3. Listen for Navigate command from SearchBar
  useEffect(() => {
    const handleNavigateTo = (e: Event) => {
      const detail = (e as CustomEvent<NavigateToEventDetail>).detail;
      if (!detail) return;

      setDestination(detail);
      setIsOpen(true);
      setIsMinimized(false);
      setIsEditingOrigin(false);

      const currentOrigin = originText;
      const currentCoords = originCoords || (telemetry ? [telemetry.longitude, telemetry.latitude] : null);

      computeRoute(currentOrigin, currentCoords as [number, number] | null, detail);
    };

    window.addEventListener('motion:cmd:navigate-to', handleNavigateTo);
    return () => {
      window.removeEventListener('motion:cmd:navigate-to', handleNavigateTo);
    };
  }, [originText, originCoords, telemetry, computeRoute]);

  // 4. Handle origin search autocomplete
  const handleOriginSearch = async (val: string) => {
    setOriginText(val);
    if (!val.trim() || val === 'My Location') {
      setOriginSuggestions([]);
      return;
    }
    setIsSearchingOrigin(true);
    try {
      const results = await motionApi.searchStops(val, 5);
      setOriginSuggestions(results);
    } catch {
      setOriginSuggestions([]);
    } finally {
      setIsSearchingOrigin(false);
    }
  };

  // 5. Select origin from suggestions or reset to My Location
  const handleSelectOrigin = (stop: StopSearchResult | null) => {
    if (!stop) {
      // Use current location
      setOriginText('My Location');
      if (telemetry) {
        setOriginCoords([telemetry.longitude, telemetry.latitude]);
      }
      setIsEditingOrigin(false);
      setOriginSuggestions([]);
      if (destination) {
        computeRoute('My Location', telemetry ? [telemetry.longitude, telemetry.latitude] : null, destination);
      }
      return;
    }

    setOriginText(stop.stop_name);
    setOriginCoords([stop.stop_lon, stop.stop_lat]);
    setIsEditingOrigin(false);
    setOriginSuggestions([]);

    if (destination) {
      computeRoute(`${stop.stop_lat},${stop.stop_lon}`, [stop.stop_lon, stop.stop_lat], destination);
    }
  };

  // 6. Swap Origin & Destination
  const handleSwap = () => {
    if (!destination) return;

    const oldOrigText = originText;
    const oldOrigCoords = originCoords;

    const newDest: NavigateToEventDetail = {
      stop_id: 'custom_origin',
      stop_name: oldOrigText === 'My Location' ? telemetry?.locationName || 'Melbourne CBD' : oldOrigText,
      stop_lat: oldOrigCoords ? oldOrigCoords[1] : telemetry?.latitude || -37.818,
      stop_lon: oldOrigCoords ? oldOrigCoords[0] : telemetry?.longitude || 144.9671,
      mode: 'Address / Location',
    };

    setOriginText(destination.stop_name);
    setOriginCoords([destination.stop_lon, destination.stop_lat]);
    setDestination(newDest);

    computeRoute(
      `${destination.stop_lat},${destination.stop_lon}`,
      [destination.stop_lon, destination.stop_lat],
      newDest
    );
  };

  // 7. Clear Navigation & Close
  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
    setRoute(null);
    setDestination(null);
    setErrorMessage(null);
    setIsEditingOrigin(false);

    // Clear route layers on map
    window.dispatchEvent(new CustomEvent('motion:cmd:clear-route'));
  };

  // 8. Handle Global Escape key for Navigation: 1st Escape -> Minimize, 2nd Escape -> Clear & Close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If editing start origin, first exit editing
        if (isEditingOrigin) {
          setIsEditingOrigin(false);
          e.stopPropagation();
          return;
        }

        if (!isMinimized) {
          // 1st Escape: Minimise route panel so user can look at the map route
          setIsMinimized(true);
          e.stopPropagation();
        } else {
          // 2nd Escape: Clear the route and close navigation panel
          handleClose();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, isMinimized, isEditingOrigin]);

  if (!isOpen) return null;

  // Minimized Compact Floating Pill HUD
  if (isMinimized) {
    return (
      <aside
        aria-label="Route Navigation Minimized Floating Pill"
        className="pointer-events-auto absolute bottom-24 left-1/2 z-20 w-full max-w-lg -translate-x-1/2 px-4 transition-all duration-300 max-[768px]:bottom-20 max-[768px]:px-2"
      >
        <div className="flex items-center justify-between gap-2.5 rounded-full border border-subtle/80 bg-surface/95 px-4 py-2 shadow-glass backdrop-blur-2xl">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="flex flex-1 items-center gap-3 overflow-hidden text-left group"
            title="Expand full route navigation details"
          >
            <span className="flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-accent-cyan shadow-glow-cyan" />
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <span className="truncate font-sans text-xs font-bold text-primary group-hover:text-accent-cyan transition-colors">
                {destination?.stop_name || 'Active Route'}
              </span>
              {route && (
                <span className="rounded-full bg-accent-cyan/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-cyan shrink-0">
                  {route.total_travel_time_mins} min • Dep {route.recommended_departure_time}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-accent-cyan group-hover:text-primary transition-colors shrink-0">
              <span>Expand ▴</span>
            </span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-secondary transition-all hover:bg-surface-hover hover:text-rose-400"
            title="Close Navigation"
            aria-label="Close Navigation"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Route Navigation HUD"
      className="pointer-events-auto absolute bottom-24 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 px-4 transition-all duration-300 max-[768px]:bottom-20 max-[768px]:px-2"
    >
      <div className="flex flex-col overflow-hidden rounded-3xl border border-subtle bg-surface/95 shadow-glass backdrop-blur-2xl transition-all">
        {/* Header: Origin & Destination Selector */}
        <div className="border-b border-subtle/60 p-4 pb-3">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-accent-cyan shadow-glow-cyan" />
              <span className="font-mono text-xs font-semibold tracking-wider text-accent-cyan uppercase">
                Active Transit Route
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Minimize Button */}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="flex h-7 items-center gap-1 rounded-full bg-surface-elevated px-2.5 text-secondary transition-all hover:bg-surface-hover hover:text-primary"
                title="Minimize panel to look at map route"
                aria-label="Minimize Route Panel"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-[10px] font-semibold">Minimize</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-secondary transition-all hover:bg-surface-hover hover:text-rose-400"
                title="Close Navigation"
                aria-label="Close Navigation"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Dual Origin / Destination / Arrive-By Bars with Swap */}
          <div className="relative flex flex-col gap-2">
            {/* Origin Row */}
            <div className="flex items-center gap-2 rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="6" />
                </svg>
              </span>

              {isEditingOrigin ? (
                <div className="relative flex-1">
                  <input
                    ref={originInputRef}
                    type="text"
                    value={originText}
                    onChange={(e) => handleOriginSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setIsEditingOrigin(false);
                        if (destination) {
                          computeRoute(originText, originCoords, destination);
                        }
                      }
                      if (e.key === 'Escape') {
                        setIsEditingOrigin(false);
                      }
                    }}
                    placeholder="Search start station or address..."
                    autoFocus
                    className="w-full bg-transparent font-sans text-xs font-semibold text-primary outline-none placeholder:text-muted"
                  />
                  {isSearchingOrigin && (
                    <span className="absolute right-1 top-0 text-[10px] text-muted font-mono animate-pulse">
                      Searching...
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingOrigin(true);
                    setTimeout(() => originInputRef.current?.select(), 50);
                  }}
                  className="flex flex-1 items-center justify-between text-left group"
                  title="Click to change departure start point"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="text-[11px] text-muted font-medium">From:</span>
                    <span className="truncate font-sans text-xs font-semibold text-primary group-hover:text-accent-cyan transition-colors">
                      {originText}
                    </span>
                  </div>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-mono text-muted group-hover:bg-surface-elevated group-hover:text-accent-cyan">
                    Edit ✎
                  </span>
                </button>
              )}
            </div>

            {/* Origin Autocomplete Suggestions Dropdown */}
            {isEditingOrigin && (
              <div className="rounded-xl border border-subtle/80 bg-surface-elevated p-2 shadow-2xl">
                <button
                  type="button"
                  onClick={() => handleSelectOrigin(null)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-accent-cyan hover:bg-surface-hover"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Use Current GPS Location ({telemetry?.locationName || 'Melbourne CBD'})</span>
                </button>

                {originSuggestions.map((s) => (
                  <button
                    key={s.stop_id}
                    type="button"
                    onClick={() => handleSelectOrigin(s)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-primary hover:bg-surface-hover"
                  >
                    <span className="truncate font-semibold">{s.stop_name}</span>
                    <span className="text-[10px] text-muted font-mono">{s.mode}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Destination Row */}
            <div className="flex items-center gap-2 rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                </svg>
              </span>
              <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
                <span className="text-[11px] text-muted font-medium">To:</span>
                <span className="truncate font-sans text-xs font-bold text-primary">
                  {destination?.stop_name || 'Destination'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSwap}
                className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface-elevated text-secondary transition-all hover:bg-surface-hover hover:text-accent-cyan"
                title="Swap Origin & Destination"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            {/* Arrive By Row (Encapsulated in matching styled card) */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-deep/60 px-3 py-2 border border-subtle/40">
              {/* Left: Icon + Label + Time Box + AM/PM Toggle */}
              <div className="flex items-center gap-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-cyan/20 text-accent-cyan">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>

                <span className="text-[11px] text-muted font-medium shrink-0">Arrive:</span>

                {/* Pre-populated Time Box */}
                <input
                  type="time"
                  value={customArrivalTime}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomArrivalTime(val);
                    setArriveByMode('custom');
                    if (val && destination) {
                      computeRoute(originText, originCoords, destination, val);
                    }
                  }}
                  title="Directly enter or adjust target arrival time"
                  className="h-6 w-24 rounded-lg border border-subtle/80 bg-surface-elevated px-1.5 font-mono text-[11px] font-bold text-accent-cyan outline-none transition-all hover:border-accent-cyan/60 focus:border-accent-cyan"
                />

                {/* Explicit AM / PM Segmented Toggle */}
                {(() => {
                  const { isPM } = parse24To12(customArrivalTime);
                  return (
                    <div className="flex overflow-hidden rounded-lg border border-subtle/80 bg-surface-elevated p-0.5 text-[10px] font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => handleToggleAmPm(false)}
                        className={`rounded px-1.5 py-0.5 transition-all ${
                          !isPM
                            ? 'bg-accent-cyan text-deep shadow-sm font-extrabold'
                            : 'text-muted hover:text-primary'
                        }`}
                        title="Switch target time to AM (Morning)"
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAmPm(true)}
                        className={`rounded px-1.5 py-0.5 transition-all ${
                          isPM
                            ? 'bg-accent-cyan text-deep shadow-sm font-extrabold'
                            : 'text-muted hover:text-primary'
                        }`}
                        title="Switch target time to PM (Afternoon / Evening)"
                      >
                        PM
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Sub-option Preset Chips */}
              <div className="flex items-center gap-1">
                {/* Latest / ASAP (Default) */}
                <button
                  type="button"
                  onClick={() => handleSetArrivalTime('latest')}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${
                    arriveByMode === 'latest'
                      ? 'bg-accent-cyan text-deep shadow-glow-cyan font-bold'
                      : 'bg-surface-elevated text-secondary hover:bg-surface-hover hover:text-primary'
                  }`}
                  title="Pre-populate to upcoming transit departure from now (Default)"
                >
                  Latest
                </button>

                {/* +15m Preset */}
                <button
                  type="button"
                  onClick={() => handleSetArrivalTime('custom', 15)}
                  className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-secondary hover:bg-surface-hover hover:text-primary transition-all"
                  title="Pre-populate time to +15 minutes"
                >
                  +15m
                </button>

                {/* +30m Preset */}
                <button
                  type="button"
                  onClick={() => handleSetArrivalTime('custom', 30)}
                  className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-secondary hover:bg-surface-hover hover:text-primary transition-all"
                  title="Pre-populate time to +30 minutes"
                >
                  +30m
                </button>

                {/* +1h Preset */}
                <button
                  type="button"
                  onClick={() => handleSetArrivalTime('custom', 60)}
                  className="rounded-full bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-secondary hover:bg-surface-hover hover:text-primary transition-all"
                  title="Pre-populate time to +1 hour"
                >
                  +1h
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 p-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
            <span className="font-sans text-xs font-semibold text-secondary animate-pulse">
              Computing optimal timetable route with live delays...
            </span>
          </div>
        )}

        {/* Error State */}
        {!isLoading && errorMessage && (
          <div className="p-4 text-center">
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Active Route Details */}
        {!isLoading && route && (
          <div className="p-4 pt-3">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl bg-deep/50 p-2 border border-subtle/30">
                <div className="font-mono text-[10px] text-muted uppercase">Duration</div>
                <div className="font-display text-sm font-bold text-accent-cyan">
                  {route.total_travel_time_mins} min
                </div>
              </div>

              <div className="rounded-xl bg-deep/50 p-2 border border-subtle/30">
                <div className="font-mono text-[10px] text-muted uppercase">Depart</div>
                <div className="font-display text-sm font-bold text-primary">
                  {route.recommended_departure_time}
                </div>
              </div>

              <div className="rounded-xl bg-deep/50 p-2 border border-subtle/30">
                <div className="font-mono text-[10px] text-muted uppercase">Arrive</div>
                <div className="font-display text-sm font-bold text-primary">
                  {route.legs.length > 0 ? route.legs[route.legs.length - 1].end_time : '--:--'}
                </div>
              </div>

              <div className="rounded-xl bg-deep/50 p-2 border border-subtle/30">
                <div className="font-mono text-[10px] text-muted uppercase">Transfers</div>
                <div className="font-display text-sm font-bold text-secondary">
                  {route.transfers_count === 0 ? 'Direct' : `${route.transfers_count} transfer`}
                </div>
              </div>
            </div>

            {/* Mode Strip Timeline */}
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto py-1">
              {route.legs.map((leg, idx) => {
                const color = getLegColor(leg);
                const isWalk = leg.type === 'WALK' || leg.mode.toLowerCase().includes('walk');
                return (
                  <React.Fragment key={idx}>
                    <div
                      className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
                      style={{
                        backgroundColor: color,
                        boxShadow: `0 0 12px ${color}55`,
                      }}
                    >
                      {isWalk ? (
                        <span>🚶 {leg.duration_mins}m</span>
                      ) : (
                        <span>
                          {leg.mode.includes('Train') ? '🚆' : leg.mode.includes('Tram') ? '🚋' : '🚌'}{' '}
                          {leg.route || leg.mode} ({leg.duration_mins}m)
                        </span>
                      )}
                    </div>
                    {idx < route.legs.length - 1 && (
                      <span className="text-muted font-bold text-xs">›</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Replacement Bus / Disruption Notice */}
            {route.replacement_buses_used && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
                <span className="text-base">⚠️</span>
                <span>Rail replacement bus in effect along disrupted corridor.</span>
              </div>
            )}

            {/* Expandable Turn-by-Turn Accordion */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between rounded-xl bg-surface-elevated/70 px-3 py-2 text-xs font-medium text-secondary transition-all hover:bg-surface-elevated hover:text-primary"
              >
                <span>{isExpanded ? 'Hide Step-by-Step Directions' : 'View Step-by-Step Directions'}</span>
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="mt-2 max-h-56 overflow-y-auto space-y-2 pr-1">
                  {route.legs.map((leg, idx) => {
                    const color = getLegColor(leg);
                    const isWalk = leg.type === 'WALK';
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-subtle/40 bg-deep/40 p-2.5 text-xs"
                      >
                        <div
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-primary">{leg.instruction}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-mono text-muted">
                            <span>{leg.start_time} - {leg.end_time}</span>
                            <span>•</span>
                            <span>{leg.duration_mins} min</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
