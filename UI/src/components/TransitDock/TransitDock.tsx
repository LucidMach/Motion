import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motionApi, type RouteMetadata, type RouteStop } from '../../services/api';
import { DEFAULT_HUB } from '../../scripts/map/transitHub';
import type { LocationTelemetry, VehicleSelectedEventDetail } from '../../types/events';
import TransitExplorer, { MODE_CONFIG, type TransitMode } from './TransitExplorer';
import VehiclePanel, { type VehicleDetail } from './VehiclePanel';

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MODES: TransitMode[] = ['train', 'tram', 'bus'];

export default function TransitDock() {
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<TransitMode>('train');
  const [routesByMode, setRoutesByMode] = useState<Partial<Record<TransitMode, RouteMetadata[]>>>({});
  const [loadingMode, setLoadingMode] = useState<TransitMode | null>(null);
  const [liveTrainCounts, setLiveTrainCounts] = useState<Record<string, number>>({});

  // Active highlighted route state
  const [selectedRoute, setSelectedRoute] = useState<{
    mode: TransitMode;
    route: RouteMetadata;
  } | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [nearestVehicle, setNearestVehicle] = useState<{
    coords: [number, number];
    distanceLabel: string;
  } | null>(null);
  const activeRouteShape = useRef<GeoJSON.FeatureCollection | null>(null);

  // Selected live vehicle on the map (displayed in right-side VehiclePanel)
  const [inspectedVehicle, setInspectedVehicle] = useState<VehicleDetail | null>(null);

  const lastLocation = useRef<[number, number]>(DEFAULT_HUB.coords);

  // Track user GPS location updates
  useEffect(() => {
    const onLocation = (e: Event) => {
      const detail = (e as CustomEvent<LocationTelemetry>).detail;
      if (detail) lastLocation.current = [detail.longitude, detail.latitude];
    };
    window.addEventListener('motion:location', onLocation);
    return () => window.removeEventListener('motion:location', onLocation);
  }, []);

  // Listen for in-map vehicle click events
  useEffect(() => {
    const onVehicleSelected = (e: Event) => {
      const detail = (e as CustomEvent<VehicleSelectedEventDetail>).detail;
      if (detail) {
        let distanceLabel: string | undefined;
        if (detail.coords) {
          const distKm = haversineKm(
            lastLocation.current[1],
            lastLocation.current[0],
            detail.coords[1],
            detail.coords[0]
          );
          distanceLabel = distKm < 1 ? `${Math.round(distKm * 1000)}m away` : `${distKm.toFixed(1)} km away`;
        }
        setInspectedVehicle({
          ...detail,
          distanceLabel
        });
      }
    };
    window.addEventListener('motion:vehicle-selected', onVehicleSelected);
    return () => window.removeEventListener('motion:vehicle-selected', onVehicleSelected);
  }, []);

  // Clear route highlight
  const handleClearRoute = useCallback(() => {
    setSelectedRoute(null);
    setRouteStops([]);
    setNearestVehicle(null);
    activeRouteShape.current = null;
    window.dispatchEvent(new CustomEvent('motion:cmd:clear-route-highlight'));
  }, []);

  // Dismiss Explorer and clear active route highlight
  const handleCloseExplorer = useCallback(() => {
    setIsExplorerOpen(false);
    handleClearRoute();
  }, [handleClearRoute]);

  // Broadcast sidebar toggle to ease camera viewport padding
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('motion:sidebar-toggle', {
        detail: { isOpen: isExplorerOpen }
      })
    );
  }, [isExplorerOpen]);

  // Broadcast vehicle panel toggle to ease camera viewport padding
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('motion:vehicle-panel-toggle', {
        detail: { isOpen: Boolean(inspectedVehicle) }
      })
    );
  }, [inspectedVehicle]);

  // Listen for empty ground click on map: dismiss right panel first, then left explorer
  useEffect(() => {
    const onMapEmptyClick = () => {
      if (inspectedVehicle) {
        setInspectedVehicle(null);
      } else if (isExplorerOpen) {
        handleCloseExplorer();
      }
    };
    window.addEventListener('motion:map-empty-click', onMapEmptyClick);
    return () => window.removeEventListener('motion:map-empty-click', onMapEmptyClick);
  }, [inspectedVehicle, isExplorerOpen, handleCloseExplorer]);

  // Keyboard shortcut listener ('T' to toggle explorer, 'Escape' to close with hierarchy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        if (isExplorerOpen) {
          handleCloseExplorer();
        } else {
          setIsExplorerOpen(true);
        }
      } else if (e.key === 'Escape') {
        if (inspectedVehicle) {
          setInspectedVehicle(null);
        } else if (isExplorerOpen) {
          handleCloseExplorer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExplorerOpen, inspectedVehicle, handleCloseExplorer]);

  // Load routes for a mode
  const loadRoutesForMode = useCallback(
    async (mode: TransitMode) => {
      if (routesByMode[mode]) return;
      setLoadingMode(mode);
      try {
        const routes = await motionApi.getRoutesByMode(mode);
        setRoutesByMode((prev) => ({ ...prev, [mode]: routes }));

        // If loading trains or trams, also fetch live vehicles to populate active vehicle counts
        if (mode === 'train' || mode === 'tram') {
          try {
            const liveFc = await motionApi.getLiveVehicles(mode);
            const counts: Record<string, number> = {};
            for (const f of liveFc.features) {
              const rName = (f.properties as any)?.route_short_name;
              if (rName) {
                counts[rName] = (counts[rName] || 0) + 1;
              }
            }
            setLiveTrainCounts((prev) => ({ ...prev, ...counts }));
          } catch {
            // Non-critical if live vehicle feed fails
          }
        }
      } catch (err) {
        console.warn(`[TransitDock] Failed to load ${mode} routes:`, err);
      } finally {
        setLoadingMode(null);
      }
    },
    [routesByMode]
  );

  // Load initial train routes on mount
  useEffect(() => {
    loadRoutesForMode('train');
  }, [loadRoutesForMode]);

  // Handle clicking a mode in the Left Dock Rail
  const handleDockModeClick = (mode: TransitMode) => {
    if (isExplorerOpen && activeMode === mode) {
      handleCloseExplorer();
    } else {
      if (selectedRoute && selectedRoute.mode !== mode) {
        handleClearRoute();
      }
      setActiveMode(mode);
      setIsExplorerOpen(true);
      loadRoutesForMode(mode);
    }
  };

  // Find nearest vehicle running on a route
  const findNearestVehicle = useCallback(
    async (
      routeShortName: string,
      mode: TransitMode = 'train'
    ): Promise<{ coords: [number, number]; distanceLabel: string } | null> => {
      try {
        const liveFc = await motionApi.getLiveVehicles(mode === 'tram' ? 'tram' : 'train');
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
      } catch {
        return null;
      }
    },
    []
  );

  // Handle selecting a route from Explorer or Vehicle card
  const handleSelectRoute = useCallback(
    async (mode: TransitMode, route: RouteMetadata) => {
      // Toggle collapse/deselect if clicking the already selected route
      if (selectedRoute?.route.route_short_name === route.route_short_name) {
        handleClearRoute();
        return;
      }

      setSelectedRoute({ mode, route });
      setInspectedVehicle(null);

      const color = route.color || MODE_CONFIG[mode].color;

      try {
        // Fetch route geometry shape
        const shapePromise = motionApi.getRouteShape(mode, route.route_short_name);

        // Fetch nearest vehicle if train or tram
        const vehiclePromise =
          mode === 'train' || mode === 'tram'
            ? findNearestVehicle(route.route_short_name, mode)
            : Promise.resolve(null);

        // Fetch route stops
        setLoadingStops(true);
        const stopsPromise = motionApi
          .getRouteStops(mode, route.route_short_name)
          .catch(() => [] as RouteStop[]);

        const [shape, vehicle, stops] = await Promise.all([shapePromise, vehiclePromise, stopsPromise]);

        activeRouteShape.current = shape;
        setNearestVehicle(vehicle);
        setRouteStops(stops);
        setLoadingStops(false);

        // Highlight route on map
        window.dispatchEvent(
          new CustomEvent('motion:cmd:highlight-route', {
            detail: {
              geojson: shape,
              color,
              skipCameraFit: Boolean(vehicle)
            }
          })
        );

        // If vehicle found, fly to it
        if (vehicle) {
          const vehicleLabel = mode === 'tram' ? 'tram' : 'train';
          const lineTitle = mode === 'tram' ? `Route ${route.route_short_name}` : `${route.route_short_name} Line`;
          window.dispatchEvent(
            new CustomEvent('motion:cmd:fly-to', {
              detail: {
                coords: vehicle.coords,
                zoom: 17.5,
                pitch: 65,
                title: lineTitle,
                subtitle: `Nearest ${vehicleLabel} • ${vehicle.distanceLabel} away`
              }
            })
          );
        }
      } catch (err) {
        console.warn('[TransitDock] Failed to load route data:', err);
        setLoadingStops(false);
      }
    },
    [findNearestVehicle, selectedRoute, handleClearRoute]
  );

  // Refit camera to currently highlighted route bounds
  const handleFitRoute = useCallback(() => {
    if (!activeRouteShape.current || !selectedRoute) return;
    window.dispatchEvent(
      new CustomEvent('motion:cmd:highlight-route', {
        detail: {
          geojson: activeRouteShape.current,
          color: selectedRoute.route.color || MODE_CONFIG[selectedRoute.mode].color,
          skipCameraFit: false
        }
      })
    );
  }, [selectedRoute]);

  // Fly to specific stop
  const handleFlyToStop = useCallback(
    (stop: RouteStop) => {
      window.dispatchEvent(
        new CustomEvent('motion:cmd:fly-to', {
          detail: {
            coords: [stop.stop_lon, stop.stop_lat],
            zoom: 17.5,
            pitch: 60,
            title: stop.stop_name,
            subtitle: `${selectedRoute?.route.route_short_name || 'Transit'} Stop #${stop.stop_sequence}`
          }
        })
      );
    },
    [selectedRoute]
  );

  // Navigate to stop
  const handleNavigateToStop = useCallback(
    (stop: RouteStop) => {
      window.dispatchEvent(
        new CustomEvent('motion:cmd:navigate-to', {
          detail: {
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            stop_lat: stop.stop_lat,
            stop_lon: stop.stop_lon,
            mode: selectedRoute?.mode === 'train' ? 'Metro Train' : selectedRoute?.mode === 'tram' ? 'Yarra Tram' : 'Bus'
          }
        })
      );
    },
    [selectedRoute]
  );

  // Fly to vehicle from VehicleHUD
  const handleFocusVehicle = useCallback((coords: [number, number]) => {
    window.dispatchEvent(
      new CustomEvent('motion:cmd:fly-to', {
        detail: {
          coords,
          zoom: 18,
          pitch: 65,
          title: 'Live Train Position',
          subtitle: 'Tracking live vehicle consist'
        }
      })
    );
  }, []);

  // Select route from VehicleHUD
  const handleSelectRouteFromVehicle = useCallback(
    async (routeShortName: string) => {
      // Find route metadata from train routes
      const trainRoutes = routesByMode.train || (await motionApi.getRoutesByMode('train'));
      const found = trainRoutes.find((r) => r.route_short_name === routeShortName);
      if (found) {
        handleSelectRoute('train', found);
      }
    },
    [routesByMode, handleSelectRoute]
  );

  return (
    <>
      {/* Floating Left Dock Rail */}
      <nav
        id="transit-dock-rail"
        aria-label="Transit modes dock"
        className={`pointer-events-auto fixed left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 max-[768px]:left-3 transition-all duration-200 ${
          isExplorerOpen ? 'opacity-0 pointer-events-none -translate-x-3' : 'opacity-100 translate-x-0'
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 rounded-full border border-subtle bg-surface-elevated/95 p-1.5 shadow-glass backdrop-blur-2xl">
          {MODES.map((mode) => {
            const config = MODE_CONFIG[mode];
            const Icon = config.icon;
            const isTabActive = isExplorerOpen && activeMode === mode;

            return (
              <button
                key={mode}
                id={`dock-mode-${mode}`}
                onClick={() => handleDockModeClick(mode)}
                title={isTabActive ? `Close ${config.label} (Esc)` : `Explore ${config.label}`}
                aria-label={isTabActive ? `Close ${config.label}` : `Explore ${config.label}`}
                className="group relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200"
                style={{
                  color: isTabActive ? config.color : 'var(--color-secondary)',
                  backgroundColor: isTabActive ? `${config.color}35` : 'transparent',
                  border: isTabActive ? `1px solid ${config.color}80` : '1px solid transparent'
                }}
              >
                <Icon size={18} />

                {/* Hover Tooltip */}
                <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-xl border border-subtle bg-surface-elevated/95 px-2.5 py-1 text-xs font-semibold text-primary shadow-glass backdrop-blur-md group-hover:block max-[768px]:hidden">
                  {isTabActive ? `Close ${config.label}` : config.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Transit Explorer Sidebar (with integrated nav rail and inline route dropdown) */}
      <TransitExplorer
        isOpen={isExplorerOpen}
        activeMode={activeMode}
        selectedRouteMode={selectedRoute?.mode}
        onChangeMode={(mode) => {
          if (selectedRoute && selectedRoute.mode !== mode) {
            handleClearRoute();
          }
          setActiveMode(mode);
          loadRoutesForMode(mode);
        }}
        routes={routesByMode[activeMode] || []}
        isLoading={loadingMode === activeMode}
        selectedRouteShortName={
          selectedRoute?.mode === activeMode ? selectedRoute.route.route_short_name : undefined
        }
        activeStops={selectedRoute?.mode === activeMode ? routeStops : []}
        isLoadingStops={loadingStops}
        nearestVehicle={selectedRoute?.mode === activeMode ? nearestVehicle : null}
        liveTrainCounts={liveTrainCounts}
        onSelectRoute={handleSelectRoute}
        onFitRoute={handleFitRoute}
        onFlyToVehicle={
          nearestVehicle
            ? () =>
                window.dispatchEvent(
                  new CustomEvent('motion:cmd:fly-to', {
                    detail: {
                      coords: nearestVehicle.coords,
                      zoom: 18,
                      pitch: 65,
                      title: `${selectedRoute?.route.route_short_name} Line`,
                      subtitle: `Nearest train • ${nearestVehicle.distanceLabel} away`
                    }
                  })
                )
            : undefined
        }
        onFlyToStop={handleFlyToStop}
        onNavigateToStop={handleNavigateToStop}
        onClearRoute={handleClearRoute}
        onClose={handleCloseExplorer}
      />

      {/* Right-Side Vehicle Inspector Panel */}
      <VehiclePanel
        vehicle={inspectedVehicle}
        onFocusVehicle={handleFocusVehicle}
        onSelectRoute={handleSelectRouteFromVehicle}
        onClose={() => setInspectedVehicle(null)}
      />
    </>
  );
}
