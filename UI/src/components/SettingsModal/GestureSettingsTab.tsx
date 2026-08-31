import type { GestureSettings, MouseDragAction } from '../../types/settings';

interface GestureSettingsTabProps {
  settings: GestureSettings;
  onChange: (updated: Partial<GestureSettings>) => void;
}

const ORBIT_OPTIONS: { id: MouseDragAction; label: string; shortLabel: string }[] = [
  { id: 'shiftLeft', label: 'Shift + Left Drag', shortLabel: '⇧ Shift + Left' },
  { id: 'right', label: 'Right Click Drag', shortLabel: 'Right Click' },
  { id: 'left', label: 'Left Click Drag', shortLabel: 'Left Click' },
  { id: 'shiftRight', label: 'Shift + Right Drag', shortLabel: '⇧ Shift + Right' }
];

const PAN_OPTIONS: { id: MouseDragAction; label: string; shortLabel: string }[] = [
  { id: 'left', label: 'Left Click Drag', shortLabel: 'Left Click' },
  { id: 'right', label: 'Right Click Drag', shortLabel: 'Right Click' },
  { id: 'shiftLeft', label: 'Shift + Left Drag', shortLabel: '⇧ Shift + Left' },
  { id: 'shiftRight', label: 'Shift + Right Drag', shortLabel: '⇧ Shift + Right' }
];

const SENSITIVITIES = [
  { value: 0.5, label: '0.5x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2.0x' }
];

export default function GestureSettingsTab({ settings, onChange }: GestureSettingsTabProps) {
  const currentOrbit = settings.orbitAction || 'shiftLeft';
  const currentPan = settings.panAction || 'left';

  const handleOrbitChange = (action: MouseDragAction) => {
    let updatedPan = currentPan;
    if (action === currentPan) {
      updatedPan = action === 'left' ? 'shiftLeft' : 'left';
    }
    onChange({ orbitAction: action, panAction: updatedPan });
  };

  const handlePanChange = (action: MouseDragAction) => {
    let updatedOrbit = currentOrbit;
    if (action === currentOrbit) {
      updatedOrbit = action === 'left' ? 'shiftLeft' : 'left';
    }
    onChange({ panAction: action, orbitAction: updatedOrbit });
  };

  return (
    <div className="flex flex-col gap-4 text-primary">
      {/* 1. Mouse Action Assignment (Reordered to align frequent combos) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3.5">
        {/* 3D Orbit Row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-[0.8rem] font-bold text-primary">3D Orbit & Tilt</span>
            <span className="font-mono text-[0.7rem] font-bold text-accent-cyan">
              {ORBIT_OPTIONS.find((o) => o.id === currentOrbit)?.shortLabel}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ORBIT_OPTIONS.map((opt) => {
              const isSelected = currentOrbit === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleOrbitChange(opt.id)}
                  className={`rounded-xl border py-2 px-1 text-center font-display text-[0.74rem] transition-all ${
                    isSelected
                      ? 'border-accent-cyan bg-surface-elevated font-bold text-accent-cyan shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                      : 'border-subtle bg-surface/50 text-secondary hover:border-subtle/80 hover:text-primary'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-subtle/60" />

        {/* 2D Pan Row (Aligned with Orbit column counterparts) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-display text-[0.8rem] font-bold text-primary">2D Map Pan</span>
            <span className="font-mono text-[0.7rem] font-bold text-accent-indigo">
              {PAN_OPTIONS.find((o) => o.id === currentPan)?.shortLabel}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PAN_OPTIONS.map((opt) => {
              const isSelected = currentPan === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handlePanChange(opt.id)}
                  className={`rounded-xl border py-2 px-1 text-center font-display text-[0.74rem] transition-all ${
                    isSelected
                      ? 'border-accent-indigo bg-surface-elevated font-bold text-accent-indigo shadow-[0_0_10px_rgba(99,102,241,0.25)]'
                      : 'border-subtle bg-surface/50 text-secondary hover:border-subtle/80 hover:text-primary'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Speed & Pitch Direction */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {/* Orbit Speed */}
        <div className="flex flex-col gap-1.5 rounded-2xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.78rem] font-semibold text-primary">Orbit Speed</span>
            <span className="font-mono text-[0.7rem] font-bold text-accent-cyan">{settings.orbitSensitivity}x</span>
          </div>
          <div className="flex gap-1 rounded-lg border border-subtle bg-surface/60 p-0.5">
            {SENSITIVITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => onChange({ orbitSensitivity: s.value })}
                className={`flex-1 rounded-md py-1 text-center font-mono text-[0.7rem] transition-all ${
                  settings.orbitSensitivity === s.value
                    ? 'bg-surface-elevated font-bold text-accent-cyan shadow-xs'
                    : 'text-secondary hover:text-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Invert Pitch Direction */}
        <div className="flex items-center justify-between rounded-2xl border border-subtle bg-[rgba(5,7,13,0.5)] p-3">
          <div className="flex flex-col">
            <span className="text-[0.78rem] font-semibold text-primary">Invert Vertical Tilt</span>
            <span className="text-[0.66rem] text-secondary">
              {settings.invertPitch ? 'Drag UP tilts UP' : 'Drag UP tilts DOWN (CAD)'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.invertPitch}
            onClick={() => onChange({ invertPitch: !settings.invertPitch })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              settings.invertPitch ? 'bg-accent-cyan' : 'bg-subtle'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ${
                settings.invertPitch ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 3. Input Features */}
      <div className="grid grid-cols-3 gap-2">
        {/* Scroll Zoom */}
        <button
          type="button"
          onClick={() => onChange({ enableScrollZoom: !settings.enableScrollZoom })}
          className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
            settings.enableScrollZoom
              ? 'border-accent-cyan/40 bg-surface-elevated text-primary'
              : 'border-subtle bg-[rgba(5,7,13,0.4)] text-secondary'
          }`}
        >
          <span className="text-[0.72rem] font-semibold">Scroll Zoom</span>
          <span className={`h-2 w-2 rounded-full ${settings.enableScrollZoom ? 'bg-accent-cyan shadow-[0_0_6px_var(--color-glow)]' : 'bg-muted/40'}`} />
        </button>

        {/* Double Click */}
        <button
          type="button"
          onClick={() => onChange({ enableDoubleClickZoom: !settings.enableDoubleClickZoom })}
          className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
            settings.enableDoubleClickZoom
              ? 'border-accent-cyan/40 bg-surface-elevated text-primary'
              : 'border-subtle bg-[rgba(5,7,13,0.4)] text-secondary'
          }`}
        >
          <span className="text-[0.72rem] font-semibold">Double Click</span>
          <span className={`h-2 w-2 rounded-full ${settings.enableDoubleClickZoom ? 'bg-accent-cyan shadow-[0_0_6px_var(--color-glow)]' : 'bg-muted/40'}`} />
        </button>

        {/* Keyboard Nav */}
        <button
          type="button"
          onClick={() => onChange({ enableKeyboard: !settings.enableKeyboard })}
          className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
            settings.enableKeyboard
              ? 'border-accent-cyan/40 bg-surface-elevated text-primary'
              : 'border-subtle bg-[rgba(5,7,13,0.4)] text-secondary'
          }`}
        >
          <span className="text-[0.72rem] font-semibold">Keyboard Nav</span>
          <span className={`h-2 w-2 rounded-full ${settings.enableKeyboard ? 'bg-accent-cyan shadow-[0_0_6px_var(--color-glow)]' : 'bg-muted/40'}`} />
        </button>
      </div>
    </div>
  );
}
