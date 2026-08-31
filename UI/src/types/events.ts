// Shared payload types for the `window` CustomEvent bus documented in
// each component's .spec.md. Both the React UI and the map controller
// import from here so neither owns the other's types.

export interface StatusEventDetail {
  state: 'ready' | 'needs_token' | 'gps_acquiring' | 'gps_active' | 'gps_fallback' | 'gps_unsupported' | 'error';
  message: string;
}

export interface RegionChangeEventDetail {
  regionName: string;
}

export interface PerspectiveEventDetail {
  is3D: boolean;
}

export interface LocationTelemetry {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  source: 'gps' | 'preset' | 'default';
  locationName?: string;
}

export interface ThemeChangeEventDetail {
  settings: import('./settings').ThemeSettings;
}

export interface GestureChangeEventDetail {
  settings: import('./settings').GestureSettings;
}

