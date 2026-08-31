export interface GeolocationCallbacks {
  onUpdate: (pos: GeolocationPosition, isFirstFix: boolean) => void;
  onError: (err: GeolocationPositionError) => void;
  onUnsupported: () => void;
}

// Wraps the browser Geolocation API: one quick fix plus a continuous watch.
export class GeolocationTracker {
  private watchId: number | null = null;

  constructor(private callbacks: GeolocationCallbacks) {}

  start(): void {
    if (!navigator.geolocation) {
      this.callbacks.onUnsupported();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => this.callbacks.onUpdate(pos, true),
      (err) => this.callbacks.onError(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.callbacks.onUpdate(pos, false),
      (err) => this.callbacks.onError(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
