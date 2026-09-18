import { useEffect, useRef, useState } from 'react';
import { getThemeSettings, saveThemeSettings, getCurrentLocalMinutes } from '../../scripts/settings/themeManager';
import { calculateSolarState } from '../../scripts/map/mapThemeCustomizer';
import type { ThemeChangeEventDetail } from '../../types/events';

function formatMinutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = Math.floor(m % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export default function DaylightSlider() {
  const [timeMinutes, setTimeMinutes] = useState<number>(() => getCurrentLocalMinutes());
  const [isLive, setIsLive] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isDraggingState, setIsDraggingState] = useState<boolean>(false);

  const isDragging = useRef(false);
  const isLiveRef = useRef(true);
  const rafId = useRef<number | null>(null);
  const latestMinutesRef = useRef<number>(timeMinutes);

  useEffect(() => {
    const current = getThemeSettings();
    const liveSync = current.syncWithRealTime !== false;
    const initialMinutes = liveSync
      ? getCurrentLocalMinutes()
      : typeof current.timeMinutes === 'number'
      ? current.timeMinutes
      : getCurrentLocalMinutes();

    setTimeMinutes(initialMinutes);
    setIsLive(liveSync);
    isLiveRef.current = liveSync;
    latestMinutesRef.current = initialMinutes;

    if (liveSync) {
      dispatchUpdate(initialMinutes, false, true);
    }

    const handleThemeChange = (e: Event) => {
      if (isDragging.current) return;
      const detail = (e as CustomEvent<ThemeChangeEventDetail>).detail;
      if (typeof detail?.settings?.timeMinutes === 'number') {
        setTimeMinutes(detail.settings.timeMinutes);
        latestMinutesRef.current = detail.settings.timeMinutes;
      }
      if (typeof detail?.settings?.syncWithRealTime === 'boolean') {
        setIsLive(detail.settings.syncWithRealTime);
        isLiveRef.current = detail.settings.syncWithRealTime;
      }
    };

    const tickerInterval = setInterval(() => {
      if (isLiveRef.current && !isDragging.current) {
        const currentLocal = getCurrentLocalMinutes();
        if (currentLocal !== latestMinutesRef.current) {
          setTimeMinutes(currentLocal);
          latestMinutesRef.current = currentLocal;
          dispatchUpdate(currentLocal, false, true);
        }
      }
    }, 10000);

    window.addEventListener('motion:theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('motion:theme-change', handleThemeChange);
      clearInterval(tickerInterval);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const dispatchUpdate = (minutes: number, persistImmediate: boolean = false, syncLive: boolean = false) => {
    const solar = calculateSolarState(minutes);
    const current = getThemeSettings();
    saveThemeSettings(
      {
        ...current,
        timeMinutes: minutes,
        lightPreset: solar.lightPreset,
        syncWithRealTime: syncLive
      },
      { persistImmediate }
    );
  };

  const handleSliderInput = (rawMinutes: number) => {
    setTimeMinutes(rawMinutes);
    latestMinutesRef.current = rawMinutes;
    setIsLive(false);
    isLiveRef.current = false;

    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(() => {
        dispatchUpdate(latestMinutesRef.current, false, false);
        rafId.current = null;
      });
    }
  };

  const handlePointerDown = () => {
    isDragging.current = true;
    setIsDraggingState(true);
    setIsLive(false);
    isLiveRef.current = false;
  };

  const handlePointerUp = () => {
    isDragging.current = false;
    setIsDraggingState(false);
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    dispatchUpdate(latestMinutesRef.current, true, false);
  };

  const handleToggleLive = () => {
    if (isLive) {
      // Unsync / Pause live tracking at current time
      setIsLive(false);
      isLiveRef.current = false;
      dispatchUpdate(latestMinutesRef.current, true, false);
    } else {
      // Sync to real-world current local time and resume live tracking
      const local = getCurrentLocalMinutes();
      setTimeMinutes(local);
      latestMinutesRef.current = local;
      setIsLive(true);
      isLiveRef.current = true;
      dispatchUpdate(local, true, true);
    }
  };

  const solar = calculateSolarState(timeMinutes);
  const formattedTime = formatMinutesToTime(timeMinutes);
  const sunriseTime = solar.solarTimes ? formatMinutesToTime(solar.solarTimes.sunriseMinutes) : '06:14';
  const sunsetTime = solar.solarTimes ? formatMinutesToTime(solar.solarTimes.sunsetMinutes) : '18:14';
  const sliderPercent = Math.min(100, Math.max(0, (timeMinutes / 1440) * 100));

  return (
    <div
      aria-label="Daylight Time Controller"
      className="flex flex-1 items-center gap-2 sm:gap-3 rounded-full border border-subtle bg-black/50 px-3 py-1.5 shadow-inner backdrop-blur-md select-none max-w-full sm:max-w-md md:max-w-xl"
    >
      {/* Time Badge with Toggleable Live Sync Button & NOAA Ephemeris Tooltip */}
      <div
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-surface-elevated/90 px-2.5 py-1 text-xs font-semibold text-primary shadow-xs"
        title={`Solar Ephemeris: Sunrise ${sunriseTime} • Sunset ${sunsetTime} (NOAA)`}
      >
        <span className="text-sm leading-none">{solar.isNight ? '🌙' : solar.lightPreset === 'dawn' ? '🌅' : solar.lightPreset === 'dusk' ? '🌆' : '☀️'}</span>
        <span className="font-mono text-[0.72rem] font-bold text-primary">{formattedTime}</span>

        {/* Live Sync / Unsync Button */}
        <button
          type="button"
          onClick={handleToggleLive}
          title={isLive ? 'Live sync active. Click to unsync / pause.' : `Unsynced. Click to sync with local time (${formatMinutesToTime(getCurrentLocalMinutes())})`}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold transition-all cursor-pointer border ${
            isLive
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs hover:bg-emerald-500/30'
              : 'bg-white/10 text-secondary hover:text-primary hover:bg-white/20 border-white/15'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-secondary/60'}`} />
          <span>Live</span>
        </button>
      </div>

      {/* Expansive Continuous Slider Track */}
      <div
        className="relative flex flex-1 items-center min-w-[120px] sm:min-w-[180px] md:min-w-[220px]"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Floating Time Bubble during Hover or Drag */}
        {(isDraggingState || isHovered) && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 z-20 flex items-center gap-1 rounded-md bg-surface-elevated/95 px-1.5 py-0.5 font-mono text-[0.66rem] font-bold text-primary shadow-lg border border-white/20 backdrop-blur-md transition-opacity duration-150"
            style={{ left: `${sliderPercent}%` }}
          >
            <span>{solar.isNight ? '🌙' : '☀️'}</span>
            <span>{formattedTime}</span>
          </div>
        )}

        <input
          type="range"
          min={0}
          max={1440}
          step={2}
          value={timeMinutes}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          onMouseUp={handlePointerUp}
          onChange={(e) => handleSliderInput(parseInt(e.target.value, 10))}
          className="diurnal-slider w-full relative z-10"
          aria-label="Solar time controller"
          aria-valuemin={0}
          aria-valuemax={1440}
          aria-valuenow={timeMinutes}
          aria-valuetext={`${formattedTime} (${solar.lightPreset})${isLive ? ' - Live Sync' : ''}`}
        />
      </div>
    </div>
  );
}



