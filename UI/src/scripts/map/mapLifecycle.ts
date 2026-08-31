import mapboxgl from 'mapbox-gl';
import { DEFAULT_HUB } from './transitHub';
import { MotionNavigationControl } from './MotionNavigationControl';
import { dispatchStatus } from './eventBus';

export interface MapLifecycleHooks {
  onReady: () => void;
  onStyleLoad: () => void;
  onMove: () => void;
  onMoveEnd: () => void;
  onPitch?: () => void;
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

export function configureOrbitControls(map: mapboxgl.Map): void {
  // Disable default BoxZoomHandler so Shift + Left Click drag orbits instead of rubber-band zooming
  if (map.boxZoom && map.boxZoom.isEnabled()) {
    map.boxZoom.disable();
  }

  const dragRotate = (map as any).dragRotate;
  if (dragRotate) {
    dragRotate.enable();
    dragRotate.enablePitch();
    dragRotate.enableRotation();

    // Mapbox mouse rotate/pitch handlers determine which button activates orbit/rotation/pitch
    // We allow:
    // - Shift + Left Mouse Button (orbit view)
    // - Ctrl + Left Mouse Button (standard Mapbox modifier)
    // - Right Mouse Button (standard secondary button orbit)
    const isOrbitButton = (e: MouseEvent, button: number): boolean => {
      return (button === 0 && (e.shiftKey || e.ctrlKey)) || button === 2;
    };

    if (dragRotate._mouseRotate) {
      dragRotate._mouseRotate._correctButton = isOrbitButton;
    }
    if (dragRotate._mousePitch) {
      dragRotate._mousePitch._correctButton = isOrbitButton;
    }
  }

  // Ensure DragPanHandler only handles normal Left Button drag without Shift or Ctrl
  const dragPan = (map as any).dragPan;
  if (dragPan && dragPan._mousePan) {
    dragPan._mousePan._correctButton = (e: MouseEvent, button: number): boolean => {
      return button === 0 && !e.shiftKey && !e.ctrlKey;
    };
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
    attributionControl: false,
    boxZoom: false
  });

  configureOrbitControls(map);

  map.addControl(new MotionNavigationControl(), 'bottom-right');

  map.on('load', () => {
    map.resize();
    configureDefault3DAtmosphere(map);
    configureOrbitControls(map);
    hooks.onReady();
  });

  map.on('style.load', () => {
    map.resize();
    configureDefault3DAtmosphere(map);
    configureOrbitControls(map);
    hooks.onStyleLoad();
  });

  map.on('move', hooks.onMove);
  map.on('moveend', hooks.onMoveEnd);
  if (hooks.onPitch) {
    map.on('pitch', hooks.onPitch);
  }

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
