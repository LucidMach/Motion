import { useCallback, useEffect, useRef, useState } from 'react';
import { motionApi, type RouteMetadata } from '../../services/api';
import { DEFAULT_HUB } from '../../scripts/map/transitHub';
import type { LocationTelemetry } from '../../types/events';
import RoutePickerWheel from './RoutePickerWheel';

type TransitMode = 'train' | 'tram' | 'bus';

const MODE_ACCENT: Record<TransitMode, string> = {
  train: '#0072CE',
  tram: '#78BE20',
  bus: '#FF8200'
};

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TrainIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="14" rx="4" />
    <path d="M4 10h16" />
    <path d="M8 21l1.5-3.5" />
    <path d="M16 21l-1.5-3.5" />
    <circle cx="8" cy="14" r="0.5" fill="currentColor" />
    <circle cx="16" cy="14" r="0.5" fill="currentColor" />
  </svg>
);

const TramIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3v2M15 3v2" />
    <rect x="3" y="5" width="18" height="13" rx="3" />
    <path d="M3 11h18" />
    <path d="M7 21l1.2-3M17 21l-1.2-3" />
  </svg>
);

const BusIcon = () => (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="13" rx="2.5" />
    <path d="M3 12h18" />
    <path d="M7 20v-2M17 20v-2" />
    <circle cx="7.5" cy="18.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="18.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const MODES: { id: TransitMode; label: string; icon: () => JSX.Element }[] = [
  { id: 'train', label: 'Train', icon: TrainIcon },
  { id: 'tram', label: 'Tram', icon: TramIcon },
  { id: 'bus', label: 'Bus', icon: BusIcon }
];

// Dock of Train/Tram/Bus mode buttons. Picking a mode opens a route picker
// wheel; picking a route highlights its shape on the map. Train additionally
// flies to the nearest currently-running vehicle on that route, since it's
// the only mode with a live position feed (see trainSimulationLayer.ts) -
// tram/bus fall back to the highlight's own bounds-fit camera framing.
export default function TransitDock() {
  const [activeMode, setActiveMode] = useState<TransitMode | null>(null);
  const [routesByMode, setRoutesByMode] = useState<Partial<Record<TransitMode, RouteMetadata[]>>>({});
  const [loadingMode, setLoadingMode] = useState<TransitMode | null>(null);
  const [selectedByMode, setSelectedByMode] = useState<Partial<Record<TransitMode, string>>>({});
  const lastLocation = useRef<[number, number]>(DEFAULT_HUB.coords);

  useEffect(() => {
    const onLocation = (e: Event) => {
      const detail = (e as CustomEvent<LocationTelemetry>).detail;
      if (detail) lastLocation.current = [detail.longitude, detail.latitude];
    };
    window.addEventListener('motion:location', onLocation);
    return () => window.removeEventListener('motion:location', onLocation);
  }, []);

  const toggleMode = useCallback(
    async (mode: TransitMode) => {
      if (activeMode === mode) {
        setActiveMode(null);
        return;
      }

      setActiveMode(mode);

      if (!routesByMode[mode]) {
        setLoadingMode(mode);
        try {
          const routes = await motionApi.getRoutesByMode(mode);
          setRoutesByMode((prev) => ({ ...prev, [mode]: routes }));
        } catch (e) {
          console.warn(`[TransitDock] Failed to load ${mode} routes:`, e);
        } finally {
          setLoadingMode(null);
        }
      }
    },
    [activeMode, routesByMode]
  );

  // Finds the nearest currently-running vehicle on a route (train only, since
  // it's the only mode with a live position feed). Returns data rather than
  // dispatching directly, so the caller can decide up front whether a
  // fly-to-vehicle command is coming - and skip the route highlight's own
  // bounds-fit accordingly, instead of letting the two camera commands race.
  const findNearestVehicleOnRoute = useCallback(
    async (routeShortName: string): Promise<{ coords: [number, number]; distanceLabel: string } | null> => {
      const liveFc = await motionApi.getLiveTrains();
      const [refLon, refLat] = lastLocation.current;

      let nearestCoords: [number, number] | null = null;
      let nearestKm = Infinity;

      for (const feature of liveFc.features) {
        if (feature.geometry.type !== 'Point') continue;
        const props = feature.properties as { route_short_name?: string } | null;
        if (props?.route_short_name !== routeShortName) continue;

        const [lon, lat] = feature.geometry.coordinates as [number, number];
        const distKm = haversineKm(refLat, refLon, lat, lon);
        if (distKm < nearestKm) {
          nearestKm = distKm;
          nearestCoords = [lon, lat];
        }
      }

      if (!nearestCoords) return null;

      return {
        coords: nearestCoords,
        distanceLabel: nearestKm < 1 ? `${Math.round(nearestKm * 1000)}m` : `${nearestKm.toFixed(1)}km`
      };
    },
    []
  );

  const handleSelectRoute = useCallback(
    async (mode: TransitMode, route: RouteMetadata) => {
      setSelectedByMode((prev) => ({ ...prev, [mode]: route.route_short_name }));

      try {
        const shapePromise = motionApi.getRouteShape(mode, route.route_short_name);
        // A live-position fetch failure should degrade to "no vehicle found"
        // (falls back to the route highlight's own bounds-fit), not abort the
        // whole selection via the outer catch.
        const nearestVehiclePromise =
          mode === 'train' ? findNearestVehicleOnRoute(route.route_short_name).catch(() => null) : Promise.resolve(null);

        const [shape, nearestVehicle] = await Promise.all([shapePromise, nearestVehiclePromise]);

        window.dispatchEvent(
          new CustomEvent('motion:cmd:highlight-route', {
            detail: {
              geojson: shape,
              color: route.color || MODE_ACCENT[mode],
              skipCameraFit: Boolean(nearestVehicle)
            }
          })
        );

        if (nearestVehicle) {
          window.dispatchEvent(
            new CustomEvent('motion:cmd:fly-to', {
              detail: {
                coords: nearestVehicle.coords,
                zoom: 18,
                pitch: 65,
                title: `${route.route_short_name} Line`,
                subtitle: `Nearest train • ${nearestVehicle.distanceLabel} away`
              }
            })
          );
        }
      } catch (e) {
        console.warn('[TransitDock] Failed to highlight route:', e);
      }
    },
    [findNearestVehicleOnRoute]
  );

  return (
    <div className="pointer-events-auto absolute left-5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-start gap-2 max-[768px]:left-3">
      <div className="flex items-center gap-1 rounded-full border border-subtle bg-surface-elevated/90 p-1.5 shadow-glass backdrop-blur-xl">
        {MODES.map(({ id, label, icon: Icon }) => {
          const isActive = activeMode === id;
          const hasSelection = Boolean(selectedByMode[id]);
          return (
            <button
              key={id}
              onClick={() => toggleMode(id)}
              title={`Browse ${label} routes`}
              aria-label={`Browse ${label} routes`}
              className="flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200"
              style={{
                color: isActive || hasSelection ? MODE_ACCENT[id] : 'var(--color-secondary)',
                backgroundColor: isActive ? `${MODE_ACCENT[id]}22` : hasSelection ? `${MODE_ACCENT[id]}14` : 'transparent'
              }}
            >
              <Icon />
            </button>
          );
        })}
      </div>

      {activeMode && loadingMode === activeMode && (
        <div className="rounded-xl border border-subtle bg-surface-elevated/90 px-4 py-2 text-xs font-semibold text-secondary shadow-glass backdrop-blur-xl">
          Loading routes...
        </div>
      )}

      {activeMode && loadingMode !== activeMode && routesByMode[activeMode] && (
        <RoutePickerWheel
          routes={routesByMode[activeMode]!}
          accentColor={MODE_ACCENT[activeMode]}
          selectedRouteShortName={selectedByMode[activeMode]}
          onSelect={(route) => handleSelectRoute(activeMode, route)}
          onClose={() => setActiveMode(null)}
        />
      )}
    </div>
  );
}
