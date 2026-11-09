// Loads the build-time-precomputed GTFS data (gtfs_db_builder/precompute_static_data.py
// and the existing UI/public/data/transit/*.geojson files) via same-origin
// self-fetch, cached in module scope so a warm serverless instance only
// pays the fetch+parse cost once. No database is queried at runtime.
import type { Point } from './geometry';

export type StopRow = [stop_id: string, stop_name: string, stop_lat: number, stop_lon: number];
export type RouteRow = [route_id: string, route_short_name: string, route_long_name: string, route_type: number];

/**
 * Mirrors SEGMENT_COLUMNS in precompute_static_data.py. Indices, not
 * values - trip_idx indexes into the sibling `trips` list, from/to_stop_idx
 * into stops.json, route_idx into routes.json. Nothing here duplicates a
 * name/coordinate that's already deduplicated in those files.
 */
export type SegmentRow = [
  trip_idx: number,
  from_secs: number,
  to_secs: number | null,
  next_dep_secs: number | null,
  from_stop_idx: number,
  to_stop_idx: number,
  route_idx: number,
  direction_id: number | null,
];

export interface WeekdayVehicleSimFile {
  trips: string[];
  segments: SegmentRow[];
}

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayName = (typeof WEEKDAY_NAMES)[number];
export function weekdayNameFromIndex(idx: number): WeekdayName {
  return WEEKDAY_NAMES[((idx % 7) + 7) % 7];
}

async function fetchJson<T>(origin: string, path: string): Promise<T> {
  const res = await fetch(new URL(path, origin));
  if (!res.ok) {
    throw new Error(`Static asset fetch failed [${res.status}]: ${path}`);
  }
  return (await res.json()) as T;
}

let stopsCache: StopRow[] | null = null;
export async function getStops(origin: string): Promise<StopRow[]> {
  if (!stopsCache) {
    stopsCache = await fetchJson<StopRow[]>(origin, '/data/stops.json');
  }
  return stopsCache;
}

let routesCache: RouteRow[] | null = null;
export async function getRoutes(origin: string): Promise<RouteRow[]> {
  if (!routesCache) {
    routesCache = await fetchJson<RouteRow[]>(origin, '/data/routes.json');
  }
  return routesCache;
}

const vehicleSimCache = new Map<WeekdayName, WeekdayVehicleSimFile>();
export async function getVehicleSim(origin: string, weekday: WeekdayName): Promise<WeekdayVehicleSimFile> {
  let cached = vehicleSimCache.get(weekday);
  if (!cached) {
    cached = await fetchJson<WeekdayVehicleSimFile>(origin, `/data/vehicle-sim/${weekday}.json`);
    vehicleSimCache.set(weekday, cached);
  }
  return cached;
}

export interface LineFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: Point[] };
  properties: {
    shape_id?: string;
    route_id?: string;
    route_short_name?: string;
    route_long_name?: string;
    color?: string;
    line_group?: string;
    outline?: boolean;
    shuttle?: boolean;
    mode?: string;
    [k: string]: unknown;
  };
}
export interface LineFeatureCollection {
  type: 'FeatureCollection';
  features: LineFeature[];
}

let metroTrainsGeoJsonCache: LineFeatureCollection | null = null;
export async function getMetroTrainsGeoJSON(origin: string): Promise<LineFeatureCollection> {
  if (!metroTrainsGeoJsonCache) {
    metroTrainsGeoJsonCache = await fetchJson<LineFeatureCollection>(origin, '/data/transit/ptv_metro_trains.geojson');
  }
  return metroTrainsGeoJsonCache;
}

let tramLinesGeoJsonCache: LineFeatureCollection | null = null;
export async function getTramLinesGeoJSON(origin: string): Promise<LineFeatureCollection> {
  if (!tramLinesGeoJsonCache) {
    tramLinesGeoJsonCache = await fetchJson<LineFeatureCollection>(origin, '/data/transit/ptv_tram_lines.geojson');
  }
  return tramLinesGeoJsonCache;
}

export interface ShapeData {
  tripShapeMap: Map<string, string>; // trip_id -> shape_id
  shapePolylines: Map<string, Point[]>; // shape_id -> ordered [lon, lat]
  routeColors: Map<string, string>; // route_short_name -> hex color
}

let trainShapeDataCache: ShapeData | null = null;
async function getTrainShapeData(origin: string): Promise<ShapeData> {
  if (trainShapeDataCache) return trainShapeDataCache;

  const [tripShapeMapRaw, lines] = await Promise.all([
    fetchJson<Record<string, string>>(origin, '/data/transit/ptv_trip_shape_map.json'),
    getMetroTrainsGeoJSON(origin),
  ]);

  const shapePolylines = new Map<string, Point[]>();
  const routeColors = new Map<string, string>();
  for (const f of lines.features) {
    if (f.geometry?.type === 'LineString' && f.properties?.shape_id) {
      shapePolylines.set(f.properties.shape_id, f.geometry.coordinates);
    }
    if (f.properties?.route_short_name && f.properties?.color && !routeColors.has(f.properties.route_short_name)) {
      routeColors.set(f.properties.route_short_name, f.properties.color);
    }
  }

  trainShapeDataCache = { tripShapeMap: new Map(Object.entries(tripShapeMapRaw)), shapePolylines, routeColors };
  return trainShapeDataCache;
}

let tramShapeDataCache: ShapeData | null = null;
async function getTramShapeData(origin: string): Promise<ShapeData> {
  if (tramShapeDataCache) return tramShapeDataCache;

  const [tripShapeMapRaw, lines] = await Promise.all([
    fetchJson<Record<string, string>>(origin, '/data/transit/ptv_tram_trip_shape_map.json'),
    getTramLinesGeoJSON(origin),
  ]);

  const shapePolylines = new Map<string, Point[]>();
  const routeColors = new Map<string, string>();
  for (const f of lines.features) {
    if (f.geometry?.type === 'LineString' && f.properties?.shape_id) {
      shapePolylines.set(f.properties.shape_id, f.geometry.coordinates);
    }
    if (f.properties?.route_short_name && f.properties?.color && !routeColors.has(f.properties.route_short_name)) {
      routeColors.set(f.properties.route_short_name, f.properties.color);
    }
  }

  tramShapeDataCache = { tripShapeMap: new Map(Object.entries(tripShapeMapRaw)), shapePolylines, routeColors };
  return tramShapeDataCache;
}

/** mode: 'train' | 'tram' | 'all' - merges train+tram maps for 'all', train wins on key collision (matches network_service.py's dict.update ordering). */
export async function getShapeData(origin: string, mode: 'train' | 'tram' | 'all'): Promise<ShapeData> {
  if (mode === 'train') return getTrainShapeData(origin);
  if (mode === 'tram') return getTramShapeData(origin);

  const [train, tram] = await Promise.all([getTrainShapeData(origin), getTramShapeData(origin)]);
  return {
    tripShapeMap: new Map([...train.tripShapeMap, ...tram.tripShapeMap]),
    shapePolylines: new Map([...train.shapePolylines, ...tram.shapePolylines]),
    routeColors: new Map([...train.routeColors, ...tram.routeColors]),
  };
}

export const DEFAULT_TRAIN_COLOR = '#0072CE';
export const DEFAULT_TRAM_COLOR = '#78BE20';
