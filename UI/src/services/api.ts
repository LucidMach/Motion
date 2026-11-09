// API client service for Motion's own Astro API routes (UI/src/pages/api/)

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
  text_color?: string;
  group: string;
  mode: string;
  outline?: boolean;
  shuttle?: boolean;
}

export interface RouteStop {
  stop_id: string;
  stop_name: string;
  full_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_sequence: number;
  is_interchange?: boolean;
}

export interface LiveVehicle {
  trip_id: string;
  route_short_name: string;
  route_long_name?: string;
  mode: 'train' | 'tram' | 'bus';
  color: string;
  lat: number;
  lon: number;
  bearing_deg?: number;
  progress?: number;
  status?: string;
  from_stop_id?: string;
  to_stop_id?: string;
  from_stop_name?: string;
  to_stop_name?: string;
  current_stop_id?: string;
  current_stop_name?: string;
  destination?: string;
  direction_id?: number;
  is_stopped?: boolean;
}

// The API routes live in this same Astro app now (UI/src/pages/api/) - no
// separate backend origin to resolve.
export const getApiBaseUrl = (): string => '';

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

  // Static, build-time-precomputed assets (see precompute_route_data/) served
  // directly by the frontend's own origin - no backend involved at all.
  private async requestStatic<T>(path: string): Promise<T> {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Static asset error [${response.status}]: ${path}`);
      }
      return await response.json();
    } catch (err: any) {
      console.warn(`[MotionAPI] Static asset request failed for ${path}:`, err.message);
      throw err;
    }
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

  async getLiveTrains(): Promise<GeoJSON.FeatureCollection> {
    return this.request<GeoJSON.FeatureCollection>('/api/network/trains/live');
  }

  async getLiveVehicles(mode: 'all' | 'train' | 'tram' = 'all'): Promise<GeoJSON.FeatureCollection> {
    return this.request<GeoJSON.FeatureCollection>(`/api/network/vehicles/live?mode=${mode}`);
  }

  async getRoutesByMode(mode: 'train' | 'tram' | 'bus'): Promise<RouteMetadata[]> {
    return this.request<RouteMetadata[]>(`/api/network/routes/${mode}`);
  }

  async getRouteShape(mode: 'train' | 'tram' | 'bus', routeShortName: string): Promise<GeoJSON.FeatureCollection> {
    return this.requestStatic<GeoJSON.FeatureCollection>(
      `/data/transit/routes/${mode}/${encodeURIComponent(routeShortName)}/shape.json`
    );
  }

  async getRouteStops(mode: 'train' | 'tram' | 'bus', routeShortName: string): Promise<RouteStop[]> {
    return this.requestStatic<RouteStop[]>(
      `/data/transit/routes/${mode}/${encodeURIComponent(routeShortName)}/stops.json`
    );
  }

  async getLiveDisruptions(windowMins: number = 60): Promise<any[]> {
    return this.request<any[]>(`/api/disruptions/live?window_mins=${windowMins}`);
  }
}

export const motionApi = new MotionApiClient();
