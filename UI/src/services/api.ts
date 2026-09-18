// API client service for Motion FastAPI backend

export interface RouteLeg {
  type: 'WALK' | 'TRANSIT' | 'TRANSFER' | 'REPLACEMENT_BUS' | string;
  mode: string;
  route?: string;
  color?: string;
  from_stop?: string;
  to_stop?: string;
  start_time: string;
  end_time: string;
  duration_mins: number;
  distance_km?: number;
  instruction: string;
  trip_id?: string;
  is_replacement?: boolean;
  coordinates?: [number, number][]; // [[lon, lat], ...]
}

export function getLegColor(leg: RouteLeg): string {
  if (leg.color) return leg.color;

  const mode = (leg.mode || leg.type || '').toLowerCase();
  const route = (leg.route || '').toLowerCase();

  if (leg.is_replacement || leg.type === 'REPLACEMENT_BUS' || mode.includes('replacement')) {
    return '#FF8200'; // Orange for Rail Replacement Buses
  }

  if (mode.includes('walk')) {
    return '#9CA3AF'; // Grey
  }

  if (mode.includes('bus')) {
    return '#FF8200'; // Orange for Buses
  }

  if (mode.includes('tram')) {
    return '#78BE20'; // Melbourne Tram Green
  }

  if (mode.includes('train') || mode.includes('rail')) {
    if (
      route.includes('belgrave') ||
      route.includes('lilydale') ||
      route.includes('alamein') ||
      route.includes('glen waverley')
    ) {
      return '#152C6B'; // Burnley Navy
    }
    if (route.includes('cranbourne') || route.includes('pakenham')) {
      return '#34ACE1'; // Caulfield Cyan
    }
    if (
      route.includes('frankston') ||
      route.includes('werribee') ||
      route.includes('williamstown') ||
      route.includes('stony point')
    ) {
      return '#028430'; // Cross-City Green
    }
    if (route.includes('sandringham')) {
      return '#F178AF'; // Sandringham Pink
    }
    if (route.includes('craigieburn') || route.includes('upfield') || route.includes('sunbury')) {
      return '#FFBE00'; // Northern Gold
    }
    if (route.includes('mernda') || route.includes('hurstbridge')) {
      return '#BE1014'; // Clifton Hill Red
    }
    return '#0072CE'; // Default Metro Blue
  }

  return '#38BDF8';
}

export interface RouteResponse {
  status: 'Success' | 'Error';
  message?: string;
  origin?: string;
  origin_coords?: [number, number]; // [lat, lon]
  destination?: string;
  destination_coords?: [number, number]; // [lat, lon]
  target_arrival_time?: string;
  target_arrival_epoch?: number;
  latest_departure_time?: string;
  recommended_departure_time?: string;
  total_travel_time_mins?: number;
  safety_buffer_mins: number;
  realtime_delay_mins: number;
  transfers_count: number;
  modes_summary?: string;
  replacement_buses_used: boolean;
  computation_time_secs?: number;
  legs: RouteLeg[];
  route_nodes: string[];
  disruptions_detected: any[];
}

export interface RouteQueryParams {
  origin: string;
  destination: string;
  arrival_time?: string;
  arrival_timestamp?: number;
  buffer_minutes?: number;
  disruptions?: any[];
  cancelled_routes?: string[];
  cancelled_trips?: string[];
  prefer_replacement_bus?: boolean;
  fetch_live_alerts?: boolean;
}

export interface StopSearchResult {
  stop_id: string;
  stop_name: string;
  street_name?: string;
  stop_lat: number;
  stop_lon: number;
  distance_km?: number;
  walk_time_mins?: number;
  mode?: string;
}

export interface RouteMetadata {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  color: string;
  group: string;
  mode: string;
}

export interface SystemStatus {
  status: string;
  server_online: boolean;
  uptime_seconds: number;
  kdtree_in_memory: boolean;
  kdtree_nodes_count: number;
  db_path: string;
  db_exists: boolean;
  db_loaded: boolean;
  stops_count: number;
  routes_count: number;
  transit_edges_count: number;
  transfer_edges_count: number;
  ptv_api_configured: boolean;
  checks?: {
    '1_server_up'?: { status: string; message: string; uptime_seconds?: number };
    '2_kdtree_in_memory'?: { status: string; message: string; total_nodes?: number; kdtree_ready?: boolean; load_time_ms?: number };
    '3_precomputed_database_loaded'?: { status: string; message: string; db_exists?: boolean; stops_count?: number; routes_count?: number; transit_edges_count?: number; transfer_edges_count?: number };
    '4_ptv_realtime_api'?: { status: string; message: string; configured?: boolean };
    '5_mapbox_token'?: { status: string; message: string; configured?: boolean };
  };
}

export interface HealthCheckResponse {
  status: string;
  service: string;
  uptime_seconds: number;
  cold_starting: boolean;
  kdtree_in_memory: boolean;
  db_loaded: boolean;
}

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && (window as any).__MOTION_API_URL__) {
    return (window as any).__MOTION_API_URL__;
  }
  // If running locally in browser (localhost / 127.0.0.1) without an explicit remote override:
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://127.0.0.1:8000';
  }
  return import.meta.env.PUBLIC_API_URL || 'https://motionapi.onrender.com';
};

class MotionApiClient {
  get baseUrl(): string {
    return getApiBaseUrl();
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API Error [${response.status}]: ${response.statusText}`);
      }

      return await response.json();
    } catch (err: any) {
      console.warn(`[MotionAPI] Request failed for ${endpoint}:`, err.message);
      throw err;
    }
  }

  async getHealth(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('/api/health');
  }

  async getStatus(): Promise<SystemStatus> {
    return this.request<SystemStatus>('/api/status');
  }

  async searchStops(query: string, limit: number = 10): Promise<StopSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    return this.request<StopSearchResult[]>(
      `/api/stops/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`
    );
  }

  async getNearbyStops(
    lat: number,
    lon: number,
    radiusKm: number = 1.5,
    limit: number = 10
  ): Promise<StopSearchResult[]> {
    return this.request<StopSearchResult[]>(
      `/api/stops/nearby?lat=${lat}&lon=${lon}&radius_km=${radiusKm}&limit=${limit}`
    );
  }

  async getMetroLinesGeoJSON(): Promise<GeoJSON.FeatureCollection> {
    return this.request<GeoJSON.FeatureCollection>('/api/network/metro/lines');
  }

  async getMetroStationsGeoJSON(): Promise<GeoJSON.FeatureCollection> {
    return this.request<GeoJSON.FeatureCollection>('/api/network/metro/stations');
  }

  async getRoutes(): Promise<RouteMetadata[]> {
    return this.request<RouteMetadata[]>('/api/network/routes');
  }

  async getLiveDisruptions(windowMins: number = 60): Promise<any[]> {
    return this.request<any[]>(`/api/disruptions/live?window_mins=${windowMins}`);
  }

  async calculateRoute(params: RouteQueryParams): Promise<RouteResponse> {
    return this.request<RouteResponse>('/api/route', {
      method: 'POST',
      body: JSON.stringify({
        buffer_minutes: 5,
        prefer_replacement_bus: true,
        fetch_live_alerts: true,
        ...params,
      }),
    });
  }
}

export const motionApi = new MotionApiClient();
