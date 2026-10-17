import React from 'react';

export interface VehicleDetail {
  tripId: string;
  routeShortName: string;
  color: string;
  coords?: [number, number];
  mode?: 'train' | 'tram' | 'bus';
}

interface VehicleHUDProps {
  vehicle: VehicleDetail;
  onFocusVehicle: (coords: [number, number]) => void;
  onSelectRoute: (routeShortName: string) => void;
  onClose: () => void;
}

export default function VehicleHUD({
  vehicle,
  onFocusVehicle,
  onSelectRoute,
  onClose
}: VehicleHUDProps) {
  const vehicleColor = vehicle.color || '#0072CE';

  return (
    <div
      id="vehicle-inspector-hud"
      role="region"
      aria-label="Vehicle Telemetry Inspector"
      className="pointer-events-auto fixed bottom-24 right-5 z-20 flex w-80 flex-col overflow-hidden rounded-3xl border border-subtle bg-surface-elevated/95 p-4 shadow-glass backdrop-blur-2xl transition-all duration-300 max-[768px]:bottom-24 max-[768px]:right-3 max-[768px]:left-3 max-[768px]:w-auto"
      style={{
        boxShadow: `0 16px 36px -8px rgba(0, 0, 0, 0.6), 0 0 24px -4px ${vehicleColor}44`
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: vehicleColor }}
          >
            <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="4" y="3" width="16" height="14" rx="4" />
              <path d="M4 10h16" />
              <circle cx="8" cy="14" r="1" fill="currentColor" />
              <circle cx="16" cy="14" r="1" fill="currentColor" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                Live Vehicle
              </span>
            </div>
            <h4 className="font-display text-sm font-bold text-primary">
              {vehicle.mode === 'tram' ? `Route ${vehicle.routeShortName} Tram` : `${vehicle.routeShortName} Line Train`}
            </h4>
          </div>
        </div>

        <button
          onClick={onClose}
          aria-label="Dismiss vehicle card"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface/60 text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Telemetry info */}
      <div className="my-2 rounded-2xl border border-subtle bg-surface/50 p-2.5 text-xs space-y-1">
        <div className="flex items-center justify-between text-secondary">
          <span className="text-[10px] uppercase font-semibold">Service Type</span>
          <span className="font-mono text-primary font-medium">
            {vehicle.mode === 'tram' ? 'Yarra Tram Fleet' : 'Metro Electric Fleet'}
          </span>
        </div>
        <div className="flex items-center justify-between text-secondary">
          <span className="text-[10px] uppercase font-semibold">Trip ID</span>
          <span className="font-mono text-[11px] text-primary truncate max-w-[170px]" title={vehicle.tripId}>
            {vehicle.tripId}
          </span>
        </div>
        <div className="flex items-center justify-between text-secondary">
          <span className="text-[10px] uppercase font-semibold">Network Service</span>
          <span className="font-medium text-primary">In Service</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        {vehicle.coords && (
          <button
            onClick={() => onFocusVehicle(vehicle.coords!)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-cyan/20 border border-accent-cyan/40 py-2 text-xs font-semibold text-accent-cyan transition-colors hover:bg-accent-cyan/30"
          >
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {vehicle.mode === 'tram' ? 'Follow Tram' : 'Follow Train'}
          </button>
        )}

        <button
          onClick={() => onSelectRoute(vehicle.routeShortName)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-subtle bg-surface/60 py-2 text-xs font-semibold text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
          Highlight Line
        </button>
      </div>
    </div>
  );
}
