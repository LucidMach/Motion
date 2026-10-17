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

export interface FlyToEventDetail {
  coords: [number, number]; // [lon, lat]
  zoom?: number;
  pitch?: number;
  bearing?: number;
  title?: string;
  subtitle?: string;
  trackTripId?: string;
}

export interface TrackVehicleEventDetail {
  tripId: string;
  coords: [number, number];
  bearing?: number;
}

export interface NavigateToEventDetail {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  mode?: string;
  origin?: string;
  origin_coords?: [number, number]; // [lon, lat]
}

export interface PlotRouteEventDetail {
  route: import('../services/api').RouteResponse;
}

export interface ClearRouteEventDetail {
  source?: string;
}

export interface HighlightRouteEventDetail {
  geojson: GeoJSON.FeatureCollection;
  color: string;
  skipCameraFit?: boolean;
}

export interface VehicleSelectedEventDetail {
  tripId: string;
  routeShortName: string;
  color: string;
  coords?: [number, number];
  mode?: 'train' | 'tram' | 'bus';
  bearing?: number;
  fromStopId?: string;
  toStopId?: string;
  fromStopName?: string;
  toStopName?: string;
  destination?: string;
  status?: string;
  isStopped?: boolean;
  progress?: number;
}

