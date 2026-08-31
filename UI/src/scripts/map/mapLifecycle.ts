import mapboxgl from 'mapbox-gl';
import { DEFAULT_HUB } from './transitHub';
import { MotionNavigationControl } from './MotionNavigationControl';
import { dispatchStatus } from './eventBus';
import type { GestureSettings, MapLightPreset, MouseDragAction } from '../../types/settings';
import { getGestureSettings } from '../settings/gestureManager';
import { getThemeSettings, MAPBOX_STYLES } from '../settings/themeManager';
import { applyMapSeasonalPalette } from './mapThemeCustomizer';

export interface MapLifecycleHooks {
  onReady: () => void;
  onStyleLoad: () => void;
  onMove: () => void;
  onMoveEnd: () => void;
  onPitch?: () => void;
}

export function configureDefault3DAtmosphere(map: mapboxgl.Map, lightPreset?: MapLightPreset): void {
  try {
    const currentTheme = getThemeSettings();
    const mapAny = map as any;
    if (typeof mapAny.setConfigProperty === 'function') {
      const isMidnightLocked = currentTheme.presetId === 'tron' || currentTheme.presetId === 'matrix';
      const preset = isMidnightLocked ? 'night' : (lightPreset || currentTheme.lightPreset || 'day');
      const isMonochrome = currentTheme.presetId === 'monochrome' || currentTheme.presetId === 'tron' || currentTheme.mapStyle === 'monochrome';
      mapAny.setConfigProperty('basemap', 'lightPreset', preset);
      mapAny.setConfigProperty('basemap', 'theme', isMonochrome ? 'monochrome' : 'default');
      mapAny.setConfigProperty('basemap', 'show3dObjects', true);
      mapAny.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
      mapAny.setConfigProperty('basemap', 'showTransitLabels', true);
    }

    // Apply seasonal styling (grass, buildings, water, atmosphere/fog)
    applyMapSeasonalPalette(map, currentTheme.presetId);
  } catch (e) {
    console.warn('[MotionMap] Style configuration note:', e);
  }
}

function matchesDragAction(e: MouseEvent, button: number, action: MouseDragAction): boolean {
  const isShift = e.shiftKey || e.ctrlKey || e.metaKey;
  if (action === 'left') return button === 0 && !isShift;
  if (action === 'right') return button === 2 && !isShift;
  if (action === 'shiftLeft') return button === 0 && isShift;
  if (action === 'shiftRight') return button === 2 && isShift;
  return false;
}

export function configureOrbitControls(map: mapboxgl.Map, customGestures?: GestureSettings): void {
  const gestures = customGestures || getGestureSettings();
  const {
    orbitAction = 'shiftLeft',
    panAction = 'left',
    orbitSensitivity,
    invertPitch,
    enableScrollZoom,
    enableDoubleClickZoom,
    enableKeyboard
  } = gestures;

  // Disable default BoxZoomHandler
  if (map.boxZoom && map.boxZoom.isEnabled()) {
    map.boxZoom.disable();
  }

  // Configure interaction toggles
  if (map.scrollZoom) {
    if (enableScrollZoom) map.scrollZoom.enable();
    else map.scrollZoom.disable();
  }
  if (map.doubleClickZoom) {
    if (enableDoubleClickZoom) map.doubleClickZoom.enable();
    else map.doubleClickZoom.disable();
  }
  if (map.keyboard) {
    if (enableKeyboard) map.keyboard.enable();
    else map.keyboard.disable();
  }

  const isOrbitButton = (e: MouseEvent, button: number): boolean => {
    if (matchesDragAction(e, button, orbitAction)) {
      return true;
    }
    // Allow RMB drag orbit fallback when orbit is shiftLeft and pan is not RMB
    if (orbitAction === 'shiftLeft' && button === 2 && panAction !== 'right') {
      return true;
    }
    return false;
  };

  const dragRotate = (map as any).dragRotate;
  if (dragRotate) {
    dragRotate.enable();
    dragRotate.enablePitch();
    dragRotate.enableRotation();

    if (dragRotate._mouseRotate) {
      dragRotate._mouseRotate._correctButton = isOrbitButton;
      dragRotate._mouseRotate._move = function (lastPoint: any, point: any) {
        const degreesPerPixelMoved = 0.8 * orbitSensitivity;
        const bearingDelta = (point.x - lastPoint.x) * degreesPerPixelMoved;
        if (bearingDelta) {
          this._active = true;
          return { bearingDelta };
        }
      };
    }

    if (dragRotate._mousePitch) {
      dragRotate._mousePitch._correctButton = isOrbitButton;
      dragRotate._mousePitch._move = function (lastPoint: any, point: any) {
        const pitchFactor = (invertPitch ? 0.5 : -0.5) * orbitSensitivity;
        const pitchDelta = (point.y - lastPoint.y) * pitchFactor;
        if (pitchDelta) {
          this._active = true;
          return { pitchDelta };
        }
      };
    }
  }

  // Ensure DragPanHandler responds appropriately
  const dragPan = (map as any).dragPan;
  if (dragPan && dragPan._mousePan) {
    dragPan._mousePan._correctButton = (e: MouseEvent, button: number): boolean => {
      if (isOrbitButton(e, button)) {
        return false;
      }
      return matchesDragAction(e, button, panAction);
    };
  }
}

// Builds the Mapbox GL map, wires its lifecycle events, and guards against the
// zero-dimension canvas glitch that shows up while the layout is still settling.
export function createMotionMap(containerId: string, hooks: MapLifecycleHooks): mapboxgl.Map {
  const currentMapStyle = getThemeSettings().mapStyle;
  const initialStyleUrl = MAPBOX_STYLES[currentMapStyle]?.url || 'mapbox://styles/mapbox/standard';

  const map = new mapboxgl.Map({
    container: containerId,
    style: initialStyleUrl,
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
