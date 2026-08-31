import type { MapLightPreset, ThemeSettings } from '../../types/settings';
import { THEME_PRESETS } from '../../scripts/settings/themeManager';

interface ThemeSettingsTabProps {
  settings: ThemeSettings;
  onChange: (updated: Partial<ThemeSettings>) => void;
}

const LIGHT_CHECKPOINTS: { id: MapLightPreset; label: string; icon: string; time: string; desc: string }[] = [
  { id: 'dawn', label: 'Dawn', icon: '🌅', time: '06:00', desc: 'Soft morning horizon light' },
  { id: 'day', label: 'Daylight', icon: '☀️', time: '12:00', desc: 'Crisp high-contrast solar light (Default)' },
  { id: 'dusk', label: 'Dusk', icon: '🌆', time: '18:30', desc: 'Atmospheric golden hour & twilight' },
  { id: 'night', label: 'Night', icon: '🌙', time: '00:00', desc: 'Illuminated 3D cityscape & stars' }
];

export default function ThemeSettingsTab({ settings, onChange }: ThemeSettingsTabProps) {
  const currentStepIndex = Math.max(
    0,
    LIGHT_CHECKPOINTS.findIndex((cp) => cp.id === settings.lightPreset)
  );

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    const selected = LIGHT_CHECKPOINTS[index];
    if (selected) {
      onChange({ lightPreset: selected.id });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP: Time-Based 3D Atmosphere & Diurnal Sunlight Slider */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.6)] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-[0.74rem] font-bold tracking-wider text-muted uppercase">
              Time of Day & Sunlight Atmosphere
            </label>
            <span className="text-[0.76rem] font-medium text-secondary">
              Drag or click checkpoints to simulate real-time diurnal sunlight
            </span>
          </div>

          <span className="flex items-center gap-1.5 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1 font-mono text-[0.76rem] font-bold text-accent-cyan">
            <span>{LIGHT_CHECKPOINTS[currentStepIndex].icon}</span>
            <span>{LIGHT_CHECKPOINTS[currentStepIndex].label}</span>
            <span className="text-secondary/70">({LIGHT_CHECKPOINTS[currentStepIndex].time})</span>
          </span>
        </div>

        {/* Stepped Slider Track with 4 checkpoints */}
        <div className="flex flex-col gap-3 pt-2">
          <div className="relative flex items-center">
            {/* Background Track Line */}
            <div className="absolute h-2 w-full rounded-full bg-[rgba(15,23,42,0.9)] border border-subtle" />

            {/* Glowing Active Track Fill */}
            <div
              className="absolute h-2 rounded-full bg-linear-to-r from-accent-cyan to-accent-indigo shadow-[0_0_12px_var(--color-glow)] transition-all duration-200"
              style={{ width: `${(currentStepIndex / 3) * 100}%` }}
            />

            {/* Native Slider Input for smooth drag */}
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={currentStepIndex}
              onChange={handleSliderChange}
              aria-label="3D Atmosphere Sunlight Checkpoint"
              className="relative z-10 h-6 w-full cursor-pointer opacity-0"
            />

            {/* Checkpoint Dots */}
            <div className="pointer-events-none absolute left-0 right-0 flex justify-between px-1">
              {LIGHT_CHECKPOINTS.map((cp, idx) => {
                const isActive = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div
                    key={cp.id}
                    className={`flex h-4 w-4 items-center justify-center rounded-full border transition-all duration-200 ${
                      isCurrent
                        ? 'border-white bg-accent-cyan shadow-[0_0_12px_var(--color-glow)] scale-125'
                        : isActive
                        ? 'border-accent-cyan/80 bg-accent-cyan/40'
                        : 'border-muted/50 bg-[rgba(10,15,29,0.9)]'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Interactive Checkpoint Labels */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {LIGHT_CHECKPOINTS.map((cp) => {
              const isSelected = cp.id === settings.lightPreset;
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => onChange({ lightPreset: cp.id })}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border p-2 text-center transition-all ${
                    isSelected
                      ? 'border-accent-cyan/50 bg-surface-elevated text-accent-cyan shadow-[0_0_10px_var(--color-glow)]'
                      : 'border-transparent bg-transparent text-secondary hover:border-subtle hover:bg-surface-hover'
                  }`}
                >
                  <span className="text-lg">{cp.icon}</span>
                  <span className="font-display text-[0.78rem] font-bold">{cp.label}</span>
                  <span className="font-mono text-[0.66rem] text-muted">{cp.time}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Seasonal Themes & Color Aesthetics */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <label className="text-[0.74rem] font-bold tracking-wider text-muted uppercase">
              Seasonal Themes & Color Aesthetics
            </label>
            <span className="text-[0.72rem] text-secondary">
              Dynamically transforms HUD gradients, brand emblems, and radar telemetry
            </span>
          </div>
          <span className="rounded-full border border-accent-cyan/30 bg-accent-cyan/10 px-2.5 py-0.5 text-[0.7rem] font-bold text-accent-cyan">
            Reactive HUD
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {Object.values(THEME_PRESETS).map((preset) => {
            const isSelected = settings.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onChange({
                    presetId: preset.id
                  });
                }}
                className={`group relative flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition-all duration-250 ${
                  isSelected
                    ? 'border-accent-cyan bg-surface-hover shadow-[0_0_20px_var(--color-glow)] ring-1 ring-accent-cyan/40'
                    : 'border-subtle bg-[rgba(5,7,13,0.5)] hover:border-subtle/80 hover:bg-surface-elevated'
                }`}
              >
                {/* Header row: Palette badge + Swatch & Title */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {/* Swatch circle */}
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 shadow-sm"
                      style={{ backgroundColor: preset.deepBg }}
                    >
                      <div
                        className="h-4.5 w-4.5 rounded-full border border-white/30 shadow-xs"
                        style={{ backgroundColor: preset.accentCyan }}
                      />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border border-white/30"
                        style={{ backgroundColor: preset.accentIndigo }}
                      />
                    </div>

                    <div className="flex flex-col">
                      <span className="font-display text-[0.88rem] font-bold text-primary group-hover:text-white">
                        {preset.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {preset.seasonBadge && (
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[0.66rem] font-bold ${
                          preset.id === 'cyberpunk'
                            ? 'border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                            : isSelected
                            ? 'border-accent-cyan/30 bg-surface-elevated text-accent-cyan'
                            : 'border-subtle bg-surface-elevated text-secondary'
                        }`}
                      >
                        {preset.seasonBadge}
                      </span>
                    )}
                    {isSelected && (
                      <span className="flex h-2.5 w-2.5 rounded-full bg-accent-cyan shadow-[0_0_8px_var(--color-glow)]" />
                    )}
                  </div>
                </div>

                {/* Live Brand Preview Bar */}
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5">
                  <span className="font-mono text-[0.66rem] text-muted uppercase">Brand Title</span>
                  <span
                    className="bg-clip-text font-display text-[0.82rem] font-extrabold tracking-[0.1em] text-transparent"
                    style={{ backgroundImage: preset.brandGradient }}
                  >
                    MOTION
                  </span>
                </div>

                {/* Subtitle description */}
                <p className="text-[0.73rem] leading-snug text-secondary group-hover:text-primary/90">
                  {preset.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. HUD Glass & Effects */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Glass Intensity */}
        <div className="flex flex-col gap-2 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.82rem] font-semibold text-primary">Glass Blur Intensity</span>
            <span className="text-[0.72rem] text-accent-cyan capitalize">{settings.glassIntensity}</span>
          </div>
          <div className="flex gap-1.5 rounded-full border border-subtle bg-[rgba(5,7,13,0.8)] p-1">
            {(['subtle', 'standard', 'high'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => onChange({ glassIntensity: level })}
                className={`flex-1 rounded-full py-1 text-[0.72rem] font-bold transition-all ${
                  settings.glassIntensity === level
                    ? 'border border-accent-cyan/40 bg-surface-elevated text-accent-cyan shadow-[0_0_8px_var(--color-glow)]'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Neon Glow Toggle */}
        <div className="flex items-center justify-between rounded-2xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.82rem] font-semibold text-primary">Neon Glow Accents</span>
            <span className="text-[0.72rem] text-secondary">Luminous borders & marker radiance</span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.showGlow}
            onClick={() => onChange({ showGlow: !settings.showGlow })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              settings.showGlow ? 'bg-accent-cyan' : 'bg-subtle'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                settings.showGlow ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
