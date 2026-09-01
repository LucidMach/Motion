// API client service for Motion FastAPI backend

export interface RouteLeg {
  type: 'WALK' | 'TRANSIT' | 'TRANSFER' | 'REPLACEMENT_BUS' | string;
  mode: string;
  route?: string;
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
  db_path: string;
  db_exists: boolean;
  stops_count: number;
  routes_count: number;
  transit_edges_count: number;
  transfer_edges_count: number;
  ptv_api_configured: boolean;
}

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && (window as any).__MOTION_API_URL__) {
    return (window as any).__MOTION_API_URL__;
  }
  return import.meta.env.PUBLIC_API_URL || 'http://localhost:8000';
};

class MotionApiClient {
  private get baseUrl(): string {
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

  async getHealth(): Promise<{ status: string; service: string }> {
    return this.request<{ status: string; service: string }>('/api/health');
  }

  async getStatus(): Promise<SystemStatus> {
    return this.request<SystemStatus>('/api/status');
  }

  // Comprehensive offline fallback dataset for Victorian transit & landmarks
  private static readonly OFFLINE_LOCATIONS: StopSearchResult[] = [
    { stop_id: 'stop:flinders_st', stop_name: 'Flinders Street Station', street_name: 'Swanston & Flinders St, Melbourne CBD', stop_lat: -37.8181, stop_lon: 144.9663, mode: 'Train Station' },
    { stop_id: 'stop:southern_cross', stop_name: 'Southern Cross Station', street_name: 'Spencer & Collins St, Melbourne CBD', stop_lat: -37.8182, stop_lon: 144.9522, mode: 'Train Station' },
    { stop_id: 'stop:melbourne_central', stop_name: 'Melbourne Central Station', street_name: 'Swanston & La Trobe St, Melbourne CBD', stop_lat: -37.8100, stop_lon: 144.9628, mode: 'Train Station' },
    { stop_id: 'stop:parliament', stop_name: 'Parliament Station', street_name: 'Spring & Bourke St, Melbourne CBD', stop_lat: -37.8111, stop_lon: 144.9729, mode: 'Train Station' },
    { stop_id: 'stop:flagstaff', stop_name: 'Flagstaff Station', street_name: 'William & La Trobe St, Melbourne CBD', stop_lat: -37.8119, stop_lon: 144.9556, mode: 'Train Station' },
    { stop_id: 'stop:richmond', stop_name: 'Richmond Station', street_name: 'Swan Street, Richmond', stop_lat: -37.8242, stop_lon: 144.9895, mode: 'Train Station' },
    { stop_id: 'stop:south_yarra', stop_name: 'South Yarra Station', street_name: 'Toorak Road, South Yarra', stop_lat: -37.8386, stop_lon: 144.9926, mode: 'Train Station' },
    { stop_id: 'stop:footscray', stop_name: 'Footscray Station', street_name: 'Irving Street, Footscray', stop_lat: -37.8010, stop_lon: 144.9004, mode: 'Train Station' },
    { stop_id: 'stop:north_melbourne', stop_name: 'North Melbourne Station', street_name: 'Adderley Street, North Melbourne', stop_lat: -37.8073, stop_lon: 144.9427, mode: 'Train Station' },
    { stop_id: 'stop:caulfield', stop_name: 'Caulfield Station', street_name: 'Sir John Monash Dr, Caulfield East', stop_lat: -37.8770, stop_lon: 145.0423, mode: 'Train Station' },
    { stop_id: 'stop:box_hill', stop_name: 'Box Hill Station', street_name: 'Market Street, Box Hill', stop_lat: -37.8193, stop_lon: 145.1215, mode: 'Train Station' },
    { stop_id: 'stop:ringwood', stop_name: 'Ringwood Station', street_name: 'Maroondah Hwy, Ringwood', stop_lat: -37.8153, stop_lon: 145.2285, mode: 'Train Station' },
    { stop_id: 'stop:dandenong', stop_name: 'Dandenong Station', street_name: 'Foster Street, Dandenong', stop_lat: -37.9886, stop_lon: 145.2104, mode: 'Train Station' },
    { stop_id: 'stop:frankston', stop_name: 'Frankston Station', street_name: 'Young Street, Frankston', stop_lat: -38.1432, stop_lon: 145.1264, mode: 'Train Station' },
    { stop_id: 'landmark:the_spot', stop_name: 'The Spot Building', street_name: 'Berkeley Street, Carlton', stop_lat: -37.8016, stop_lon: 144.9592, mode: 'Building / Landmark' },
    { stop_id: 'landmark:alan_finkel', stop_name: 'Alan Finkel Building', street_name: 'Alliance Lane, Monash Clayton', stop_lat: -37.9126, stop_lon: 145.1332, mode: 'Building / Landmark' },
    { stop_id: 'landmark:monash_clayton', stop_name: 'Monash University Clayton', street_name: 'Wellington Road, Clayton', stop_lat: -37.9137, stop_lon: 145.1318, mode: 'Campus / Landmark' },
    { stop_id: 'landmark:unimelb', stop_name: 'University of Melbourne', street_name: 'Grattan Street, Parkville', stop_lat: -37.7983, stop_lon: 144.9610, mode: 'Campus / Landmark' },
    { stop_id: 'landmark:rmit', stop_name: 'RMIT University', street_name: 'Swanston & La Trobe St, Melbourne CBD', stop_lat: -37.8080, stop_lon: 144.9632, mode: 'Campus / Landmark' },
    { stop_id: 'landmark:mcg', stop_name: 'Melbourne Cricket Ground (MCG)', street_name: 'Brunton Avenue, East Melbourne', stop_lat: -37.8199, stop_lon: 144.9834, mode: 'Building / Landmark' },
    { stop_id: 'landmark:marvel_stadium', stop_name: 'Marvel Stadium', street_name: 'Harbour Esplanade, Docklands', stop_lat: -37.8165, stop_lon: 144.9475, mode: 'Building / Landmark' },
    { stop_id: 'landmark:queen_vic_market', stop_name: 'Queen Victoria Market', street_name: 'Elizabeth & Victoria St, Melbourne', stop_lat: -37.8076, stop_lon: 144.9568, mode: 'Building / Landmark' },
    { stop_id: 'landmark:crown', stop_name: 'Crown Melbourne', street_name: '8 Whiteman Street, Southbank', stop_lat: -37.8228, stop_lon: 144.9582, mode: 'Building / Landmark' },
    { stop_id: 'landmark:st_kilda', stop_name: 'St Kilda Beach & Esplanade', street_name: 'The Esplanade, St Kilda', stop_lat: -37.8675, stop_lon: 144.9735, mode: 'Building / Landmark' },
  ];

  /**
   * Live dynamic geocoding via OpenStreetMap Nominatim service bounded to Victoria / Australia.
   */
  async searchNominatim(query: string, limit: number = 6): Promise<StopSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        trimmed
      )}&format=jsonv2&addressdetails=1&limit=${limit}&countrycodes=au&viewbox=140.9,-39.2,150.0,-33.9`;

      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((item: any) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const category = item.category || '';
        const type = item.type || '';
        const addr = item.address || {};

        let mode = 'Building / Landmark';
        if (['station', 'halt'].includes(type) || (category === 'railway' && type !== 'tram_stop')) {
          mode = 'Train Station';
        } else if (['tram_stop', 'tram'].includes(type) || category === 'tram') {
          mode = 'Tram Stop';
        } else if (['bus_stop', 'bus_station', 'platform'].includes(type) || category === 'bus') {
          mode = 'Bus Stop';
        } else if (['ferry_terminal', 'ferry'].includes(type)) {
          mode = 'Ferry Terminal';
        } else if (['university', 'college', 'school'].includes(type) || ['education', 'campus'].includes(category)) {
          mode = 'Campus / Landmark';
        } else if (['building', 'amenity', 'tourism', 'leisure', 'office', 'shop'].includes(category)) {
          mode = 'Building / Landmark';
        } else if (type === 'administrative' || category === 'boundary') {
          mode = 'Suburb / Region';
        } else {
          mode = 'Address / Location';
        }

        // Clean building / landmark title without house numbers
        const rawName = item.name || addr.building || addr.amenity || (item.display_name ? item.display_name.split(',')[0].trim() : trimmed);
        const buildingName = rawName.replace(/^\d+[\w/-]*\s+/, '').trim() || rawName;

        // Street name + suburb
        const road = addr.road || addr.pedestrian || addr.street || '';
        const suburb = addr.suburb || addr.neighbourhood || addr.city || addr.town || '';
        const streetParts = [road, suburb].filter(Boolean);
        const streetName = streetParts.length > 0 ? streetParts.join(', ') : undefined;

        return {
          stop_id: `osm:${item.osm_type || 'node'}:${item.osm_id || Math.random().toString(36).slice(2)}`,
          stop_name: buildingName,
          street_name: streetName,
          stop_lat: lat,
          stop_lon: lon,
          mode,
        };
      });
    } catch (err) {
      console.warn('[MotionAPI] Live Nominatim geocoding note:', err);
      return [];
    }
  }

  async searchStops(query: string, limit: number = 10): Promise<StopSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    
    const combined: StopSearchResult[] = [];
    const seenNames = new Set<string>();

    // 1. Try FastAPI backend (which searches GTFS database + fast cache + Nominatim)
    try {
      const backendResults = await this.request<StopSearchResult[]>(
        `/api/stops/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`
      );
      if (backendResults && Array.isArray(backendResults)) {
        for (const item of backendResults) {
          const key = item.stop_name.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            combined.push(item);
          }
        }
      }
    } catch {
      // Backend offline or unreachable
    }

    // 2. Query Live OpenStreetMap Nominatim dynamically for any address, building, or POI
    if (combined.length < limit) {
      const osmResults = await this.searchNominatim(trimmed, limit - combined.length);
      for (const item of osmResults) {
        const key = item.stop_name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          combined.push(item);
        }
      }
    }

    // 3. Client-side fallback search if still needed (e.g. completely offline)
    if (combined.length === 0) {
      const norm = trimmed.toLowerCase();
      const matches = MotionApiClient.OFFLINE_LOCATIONS.filter((loc) =>
        loc.stop_name.toLowerCase().includes(norm)
      );

      matches.sort((a, b) => {
        const aLower = a.stop_name.toLowerCase();
        const bLower = b.stop_name.toLowerCase();
        const aStarts = aLower.startsWith(norm);
        const bStarts = bLower.startsWith(norm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.stop_name.length - b.stop_name.length;
      });

      for (const item of matches) {
        const key = item.stop_name.toLowerCase();
        if (!seenNames.has(key)) {
          seenNames.add(key);
          combined.push(item);
        }
      }
    }

    return combined.slice(0, limit);
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
