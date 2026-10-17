import React from 'react';

export interface VehicleDetail {
  tripId: string;
  routeShortName: string;
  color: string;
  coords?: [number, number];
  mode?: 'train' | 'tram' | 'bus';
  distanceLabel?: string;
  speedKmh?: number;
}

interface VehiclePanelProps {
  vehicle: VehicleDetail | null;
  onFocusVehicle: (coords: [number, number]) => void;
  onSelectRoute: (routeShortName: string) => void;
  onClose: () => void;
}

export default function VehiclePanel({
  vehicle,
  onFocusVehicle,
  onSelectRoute,
  onClose
}: VehiclePanelProps) {
  const isOpen = Boolean(vehicle);
  const vehicleColor = vehicle?.color || '#0072CE';
  const modeLabel = vehicle?.mode === 'tram' ? 'Tram' : vehicle?.mode === 'bus' ? 'Bus' : 'Train';

  return (
    <aside
      id="vehicle-panel"
      role="dialog"
      aria-label="Vehicle Inspector"
      className={`pointer-events-auto fixed inset-y-0 right-0 z-50 flex w-[300px] max-w-full flex-col border-l border-subtle bg-surface-elevated/95 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out max-[768px]:w-full ${
        isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
      }`}
      style={{
        boxShadow: isOpen
          ? `-16px 0 48px -8px rgba(0, 0, 0, 0.7), -4px 0 24px -4px ${vehicleColor}44`
          : undefined
      }}
    >
      {vehicle && (
        <div className="flex h-full flex-col p-5">
          {/* Top Bar: Title & Close Button */}
          <div className="flex items-center justify-between border-b border-subtle/70 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Live {modeLabel}
              </span>
            </div>

            <button
              id="vehicle-panel-close-btn"
              onClick={onClose}
              aria-label="Close vehicle inspector"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface/60 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
            >
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Vehicle Identity & Line Badge */}
          <div className="my-5 flex items-center gap-3.5">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
              style={{ backgroundColor: vehicleColor }}
            >
              <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="4" y="3" width="16" height="14" rx="4" />
                <path d="M4 10h16" />
                <circle cx="8" cy="14" r="1" fill="currentColor" />
                <circle cx="16" cy="14" r="1" fill="currentColor" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-base font-bold text-primary">
                {vehicle.mode === 'tram'
                  ? `Route ${vehicle.routeShortName}`
                  : `${vehicle.routeShortName} Line`}
              </h3>
              <p className="text-xs text-secondary truncate">
                {vehicle.mode === 'tram' ? 'Yarra Trams Network' : 'Metro Trains Melbourne'}
              </p>
            </div>
          </div>

          {/* Telemetry Summary Cards */}
          <div className="space-y-2.5">
            {/* Distance from user */}
            <div className="flex items-center justify-between rounded-xl border border-subtle bg-surface/40 p-3">
              <div className="flex items-center gap-2 text-secondary">
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span className="text-xs font-medium">Proximity</span>
              </div>
              <span className="font-mono text-xs font-semibold text-primary">
                {vehicle.distanceLabel || 'Tracking live'}
              </span>
            </div>

            {/* Speed & status */}
            <div className="flex items-center justify-between rounded-xl border border-subtle bg-surface/40 p-3">
              <div className="flex items-center gap-2 text-secondary">
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span className="text-xs font-medium">Service State</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-primary">
                  {vehicle.speedKmh ? `${Math.round(vehicle.speedKmh)} km/h` : 'In Service'}
                </span>
              </div>
            </div>

            {/* Trip identifier */}
            <div className="flex items-center justify-between rounded-xl border border-subtle bg-surface/40 p-3">
              <div className="flex items-center gap-2 text-secondary">
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 8h10M7 12h10M7 16h6" />
                </svg>
                <span className="text-xs font-medium">Trip ID</span>
              </div>
              <span className="font-mono text-[11px] font-semibold text-primary truncate max-w-[130px]" title={vehicle.tripId}>
                {vehicle.tripId}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-auto space-y-2.5 pt-4">
            {vehicle.coords && (
              <button
                id="vehicle-panel-focus-btn"
                onClick={() => onFocusVehicle(vehicle.coords!)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-cyan/20 border border-accent-cyan/50 py-2.5 text-xs font-semibold text-accent-cyan shadow-sm transition-all hover:bg-accent-cyan/30 active:scale-[0.98]"
              >
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="8" />
                  <line x1="12" y1="2" x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                </svg>
                Focus Camera
              </button>
            )}

            <button
              id="vehicle-panel-highlight-btn"
              onClick={() => onSelectRoute(vehicle.routeShortName)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-subtle bg-surface/60 py-2.5 text-xs font-semibold text-secondary transition-all hover:bg-surface-hover hover:text-primary active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
              Highlight Route
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
