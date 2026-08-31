import mapboxgl from 'mapbox-gl';
import { DEFAULT_HUB } from './transitHub';
import { MotionNavigationControl } from './MotionNavigationControl';
import { dispatchStatus } from './eventBus';

export interface MapLifecycleHooks {
  onReady: () => void;
  onStyleLoad: () => void;
  onMove: () => void;
  onMoveEnd: () => void;
}

function configureDefault3DAtmosphere(map: mapboxgl.Map): void {
  try {
    const mapAny = map as any;
    if (typeof mapAny.setConfigProperty === 'function') {
      mapAny.setConfigProperty('basemap', 'lightPreset', 'day');
      mapAny.setConfigProperty('basemap', 'show3dObjects', true);
      mapAny.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
      mapAny.setConfigProperty('basemap', 'showTransitLabels', true);
    }
  } catch (e) {
    console.warn('[MotionMap] Style configuration note:', e);
  }
}

// Builds the Mapbox GL map, wires its lifecycle events, and guards against the
// zero-dimension canvas glitch that shows up while the layout is still settling.
export function createMotionMap(containerId: string, hooks: MapLifecycleHooks): mapboxgl.Map {
  const map = new mapboxgl.Map({
    container: containerId,
    style: 'mapbox://styles/mapbox/standard',
    center: DEFAULT_HUB.coords,
    zoom: 15.5,
    pitch: 58,
    bearing: -17.6,
    antialias: true,
    attributionControl: false
  });

  map.addControl(new MotionNavigationControl(), 'bottom-right');

  map.on('load', () => {
    map.resize();
    configureDefault3DAtmosphere(map);
    hooks.onReady();
  });

  map.on('style.load', () => {
    map.resize();
    configureDefault3DAtmosphere(map);
    hooks.onStyleLoad();
  });

  map.on('move', hooks.onMove);
  map.on('moveend', hooks.onMoveEnd);

  setTimeout(() => map.resize(), 250);
  setTimeout(() => map.resize(), 1000);
  setTimeout(() => map.resize(), 3000);

  map.on('error', (e: mapboxgl.ErrorEvent) => {
    console.warn('[MotionMap] Mapbox Notice/Error:', e);
    const isAuthError =
      e.error?.message?.includes('Forbidden') || e.error?.message?.includes('Unauthorized') || (e.error as any)?.status === 401;
    if (isAuthError) {
      dispatchStatus({ state: 'needs_token', message: 'Invalid Mapbox Token' });
    }
  });

  return map;
}
