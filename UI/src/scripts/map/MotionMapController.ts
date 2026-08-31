import mapboxgl from 'mapbox-gl';
import { resolveRegionInFocus } from './regionResolver';
import { dispatchStatus, dispatchRegion } from './eventBus';
import { UserMarkerManager } from './userMarker';
import { GeolocationTracker } from './geolocationTracker';
import { LocationCoordinator } from './locationCoordinator';
import { CameraController } from './cameraController';
import { createMotionMap } from './mapLifecycle';
import { MotionNavigationControl } from './MotionNavigationControl';
import { suppressBenignMapboxWarnings } from './suppressBenignWarnings';

export { MotionNavigationControl };

// Orchestrates the Mapbox GL map, GPS tracking, and region-in-focus detection.
// The heavy lifting lives in mapLifecycle.ts (map setup), locationCoordinator.ts
// (GPS → telemetry → marker), and cameraController.ts (perspective/flyTo) —
// this class just wires them together.
export class MotionMapController {
  private map: mapboxgl.Map | null = null;
  private markerManager: UserMarkerManager | null = null;
  private camera = new CameraController(() => this.map);
  private geoTracker = new GeolocationTracker({
    onUpdate: (pos, isFirstFix) => this.locationCoordinator.handleUpdate(pos, isFirstFix),
    onError: (err) => this.locationCoordinator.handleError(err),
    onUnsupported: () => {
      dispatchStatus({ state: 'gps_unsupported', message: 'GPS Accuracy: Unavailable' });
      this.locationCoordinator.emitDefault();
    }
  });
  private locationCoordinator = new LocationCoordinator(
    () => this.markerManager,
    (coords) => this.camera.flyTo(coords, 16.5, 60)
  );
  private token = '';
  private currentRegion = '';
  private regionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  init(containerId: string, initialToken?: string): void {
    suppressBenignMapboxWarnings();

    this.token =
      initialToken || localStorage.getItem('motion_mapbox_token') || (import.meta.env?.PUBLIC_MAPBOX_TOKEN as string) || '';

    if (!this.token || this.token.includes('replace_me')) {
      console.warn('[MotionMap] No valid Mapbox token provided. Prompting setup.');
      dispatchStatus({ state: 'needs_token', message: 'Mapbox Access Token Required' });
      return;
    }

    mapboxgl.accessToken = this.token;

    try {
      this.map = createMotionMap(containerId, {
        onReady: () => {
          this.updateRegionInFocus();
          this.camera.syncPitchState();
          dispatchStatus({ state: 'ready', message: 'GPS Accuracy: ±15m' });
        },
        onStyleLoad: () => this.updateRegionInFocus(),
        onMove: () => {
          this.scheduleRegionUpdate();
          this.camera.syncPitchState();
        },
        onMoveEnd: () => {
          this.updateRegionInFocus();
          this.camera.syncPitchState();
        },
        onPitch: () => this.camera.syncPitchState()
      });
      this.markerManager = new UserMarkerManager(this.map, () => this.flyToUser());

      dispatchStatus({ state: 'gps_acquiring', message: 'GPS Accuracy: Acquiring...' });
      this.geoTracker.start();
    } catch (err: any) {
      console.error('[MotionMap] Initialization error:', err);
      dispatchStatus({ state: 'error', message: err?.message || 'Failed to initialize map' });
    }
  }

  private scheduleRegionUpdate(): void {
    if (this.regionDebounceTimer) return;
    this.regionDebounceTimer = setTimeout(() => {
      this.regionDebounceTimer = null;
      this.updateRegionInFocus();
    }, 150);
  }

  updateRegionInFocus(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    const region = resolveRegionInFocus(center.lng, center.lat, this.map.getZoom());
    if (region !== this.currentRegion) {
      this.currentRegion = region;
      dispatchRegion(region);
    }
  }

  updateToken(newToken: string): void {
    const trimmed = newToken.trim();
    if (!trimmed) return;
    localStorage.setItem('motion_mapbox_token', trimmed);
    this.token = trimmed;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.init('map', trimmed);
  }

  flyToUser(): void {
    if (!this.map) return;
    const loc = this.locationCoordinator.lastLocation;
    if (loc) {
      this.camera.flyTo([loc.longitude, loc.latitude], 17.0, 62);
    } else {
      this.geoTracker.start();
    }
  }

  toggle3D(): boolean {
    return this.camera.toggle();
  }

  setPerspective(enable3D: boolean): boolean {
    return this.camera.setPerspective(enable3D);
  }

  destroy(): void {
    this.geoTracker.stop();
    if (this.regionDebounceTimer) clearTimeout(this.regionDebounceTimer);
    this.markerManager?.remove();
    this.map?.remove();
    this.map = null;
  }
}
