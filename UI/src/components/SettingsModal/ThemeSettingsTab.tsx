import type { MapStyleId, ThemeSettings } from '../../types/settings';
import { MAPBOX_STYLES, getCurrentLocalMinutes } from '../../scripts/settings/themeManager';
import { calculateSolarState } from '../../scripts/map/mapThemeCustomizer';

interface ThemeSettingsTabProps {
  settings: ThemeSettings;
  onChange: (updated: Partial<ThemeSettings>) => void;
}

function formatMinutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = Math.floor(m % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

const MILESTONES = [
  { minutes: 360, label: 'Dawn', icon: '🌅', time: '06:00' },
  { minutes: 720, label: 'Day', icon: '☀️', time: '12:00' },
  { minutes: 1110, label: 'Dusk', icon: '🌆', time: '18:30' },
  { minutes: 0, label: 'Night', icon: '🌙', time: '00:00' }
];

export default function ThemeSettingsTab({ settings, onChange }: ThemeSettingsTabProps) {
  const isLive = settings.syncWithRealTime !== false;
  const currentMinutes = isLive
    ? getCurrentLocalMinutes()
    : typeof settings.timeMinutes === 'number'
    ? settings.timeMinutes
    : settings.lightPreset === 'dawn'
    ? 360
    : settings.lightPreset === 'dusk'
    ? 1110
    : settings.lightPreset === 'night'
    ? 0
    : 720;

  const solar = calculateSolarState(currentMinutes, settings.lightPreset);
  const formattedTime = formatMinutesToTime(currentMinutes);
  const sunriseTime = solar.solarTimes ? formatMinutesToTime(solar.solarTimes.sunriseMinutes) : '06:14';
  const sunsetTime = solar.solarTimes ? formatMinutesToTime(solar.solarTimes.sunsetMinutes) : '18:14';
  const isDaytime = !solar.isNight;
  const shadowIntensity = typeof settings.shadowIntensity === 'number' ? settings.shadowIntensity : 0.85;

  const handleTimeChange = (newMinutes: number) => {
    const updatedSolar = calculateSolarState(newMinutes);
    onChange({
      timeMinutes: newMinutes,
      lightPreset: updatedSolar.lightPreset,
      syncWithRealTime: false
    });
  };

  const handleToggleLive = () => {
    if (isLive) {
      onChange({
        syncWithRealTime: false
      });
    } else {
      const local = getCurrentLocalMinutes();
      const updatedSolar = calculateSolarState(local);
      onChange({
        timeMinutes: local,
        lightPreset: updatedSolar.lightPreset,
        syncWithRealTime: true
      });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Time of Day & Dynamic Solar Shadow Slider */}
      <div className="flex flex-col gap-3 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.6)] p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[0.74rem] font-bold tracking-wider text-muted uppercase">
              Daylight & Building Shadows
            </span>
            <div className="flex items-center gap-2 text-[0.72rem] text-secondary">
              <span>Continuously adjust time of day</span>
              <span className="text-muted">•</span>
              <span className="text-primary/80 font-mono text-[0.66rem]">
                🌅 {sunriseTime} • 🌇 {sunsetTime}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Sync / Unsync Button */}
            <button
              type="button"
              onClick={handleToggleLive}
              title={isLive ? 'Live sync active. Click to unsync / pause.' : `Unsynced. Click to sync with your current local time (${formatMinutesToTime(getCurrentLocalMinutes())})`}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-bold transition-all cursor-pointer border ${
                isLive
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs hover:bg-emerald-500/30'
                  : 'bg-white/10 text-secondary hover:text-primary hover:bg-white/20 border-white/15'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-secondary/60'}`} />
              <span>Live</span>
            </button>

            <span className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 font-mono text-[0.72rem] font-bold text-primary">
              <span>{solar.isNight ? '🌙' : solar.lightPreset === 'dawn' ? '🌅' : solar.lightPreset === 'dusk' ? '🌆' : '☀️'}</span>
              <span>{formattedTime}</span>
            </span>
          </div>
        </div>

        {/* Diurnal Interactive Range Track */}
        <div className="flex flex-col gap-2 rounded-xl border border-subtle bg-black/40 p-4">
          <input
            type="range"
            min={0}
            max={1440}
            step={2}
            value={currentMinutes}
            onChange={(e) => handleTimeChange(parseInt(e.target.value, 10))}
            className="diurnal-slider w-full"
            aria-label="Solar time slider"
          />
        </div>

        {/* 3D Shadows Slider (active during daytime) */}
        {isDaytime ? (
          <div className="flex flex-col gap-1.5 rounded-xl border border-subtle bg-black/30 p-3 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-[0.74rem] font-semibold text-primary">3D Building Shadow Depth</span>
              <span className="font-mono text-[0.72rem] text-primary font-bold">
                {Math.round(shadowIntensity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={shadowIntensity}
              onChange={(e) => onChange({ shadowIntensity: parseFloat(e.target.value) })}
              className="h-1.5 w-full cursor-pointer accent-white"
              aria-label="3D Building Shadow Depth"
            />
            <div className="flex justify-between text-[0.62rem] text-muted">
              <span>Subtle / Soft</span>
              <span>Deep Cinematic</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[0.72rem] text-secondary mt-1">
            <span>🌌</span>
            <span>Night Mode: Dark monochrome basemap with 3D illuminated windows & starlight.</span>
          </div>
        )}
      </div>

      {/* 2. Map Basemap Style Selection */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[0.74rem] font-bold tracking-wider text-muted uppercase">
              Mapbox Basemap Style
            </span>
            <span className="text-[0.72rem] text-secondary">
              Select 3D architectural, satellite, or vector styles
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.values(MAPBOX_STYLES).map((style) => {
            const isSelected = (settings.mapStyle || 'monochrome') === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onChange({ mapStyle: style.id as MapStyleId })}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-white/40 bg-surface-elevated text-primary shadow-[0_0_12px_rgba(255,255,255,0.15)] ring-1 ring-white/30'
                    : 'border-subtle bg-[rgba(5,7,13,0.5)] hover:border-subtle/80 hover:bg-surface-hover text-secondary'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[0.84rem] font-bold text-primary">
                      {style.label}
                    </span>
                    {style.badge && (
                      <span className="rounded-full border border-subtle bg-white/5 px-2 py-0.2 text-[0.62rem] font-semibold text-muted">
                        {style.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[0.68rem] text-secondary truncate max-w-[240px]">
                    {style.tagline}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Glass & HUD Visual Effects */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Glass Blur */}
        <div className="flex items-center justify-between rounded-xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3">
          <span className="text-[0.78rem] font-semibold text-primary">Glass Blur</span>
          <div className="flex gap-1 rounded-full border border-subtle bg-[rgba(5,7,13,0.8)] p-0.5">
            {(['subtle', 'standard', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onChange({ glassIntensity: level })}
                className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold transition-all ${
                  settings.glassIntensity === level
                    ? 'bg-surface-elevated text-primary border border-white/30 shadow-xs'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* HUD Glow Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3">
          <div className="flex flex-col">
            <span className="text-[0.78rem] font-semibold text-primary">HUD Glow</span>
            <span className="text-[0.68rem] text-secondary">Luminous subtle accents</span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.showGlow}
            onClick={() => onChange({ showGlow: !settings.showGlow })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.showGlow ? 'bg-primary' : 'bg-subtle'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow-xs transition duration-200 ease-in-out ${
                settings.showGlow ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
