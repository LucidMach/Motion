import type { LocationTelemetry } from '../../types/events';
import { DEFAULT_HUB } from './transitHub';
import { resolveRegionInFocus } from './regionResolver';
import { dispatchLocation, dispatchStatus } from './eventBus';
import { UserMarkerManager } from './userMarker';

// Turns raw GeolocationPosition updates into LocationTelemetry, keeps the last
// known fix, and renders the user marker. Owns the "first fix flies the camera
// in" behavior via onFirstFix.
export class LocationCoordinator {
  lastLocation: LocationTelemetry | null = null;

  constructor(
    private getMarkerManager: () => UserMarkerManager | null,
    private onFirstFix: (coords: [number, number]) => void
  ) {}

  handleUpdate(pos: GeolocationPosition, isFirstFix: boolean): void {
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
    const locRegion = resolveRegionInFocus(longitude, latitude, 16.0);
    const locationName = locRegion.includes(' • ') ? locRegion.split(' • ')[0] : locRegion || 'My Location';

    this.lastLocation = {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      altitude: altitude ? Math.round(altitude) : null,
      altitudeAccuracy: altitudeAccuracy ? Math.round(altitudeAccuracy) : null,
      heading: heading !== null && !isNaN(heading) ? Math.round(heading) : null,
      speed: speed !== null && !isNaN(speed) ? Math.round(speed * 3.6) : null,
      timestamp: pos.timestamp,
      source: 'gps',
      locationName
    };

    this.getMarkerManager()?.render([longitude, latitude], this.lastLocation.heading, this.lastLocation.accuracy);
    dispatchLocation(this.lastLocation);
    dispatchStatus({ state: 'gps_active', message: `GPS Accuracy: ±${this.lastLocation.accuracy}m` });

    if (isFirstFix) this.onFirstFix([longitude, latitude]);
  }

  handleError(err: GeolocationPositionError): void {
    console.warn('[MotionMap] Geolocation Notice:', err.message);
    if (!this.lastLocation) this.emitDefault();
    const message = err.code === 1 ? 'GPS Accuracy: Permission Denied' : 'GPS Accuracy: Melbourne CBD (Approx)';
    dispatchStatus({ state: 'gps_fallback', message });
  }

  emitDefault(): void {
    this.lastLocation = {
      latitude: DEFAULT_HUB.coords[1],
      longitude: DEFAULT_HUB.coords[0],
      accuracy: 15,
      altitude: 35,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 0,
      timestamp: Date.now(),
      source: 'default',
      locationName: 'Melbourne CBD'
    };
    this.getMarkerManager()?.render(DEFAULT_HUB.coords, 0, 15);
    dispatchLocation(this.lastLocation);
  }
}
