// Simulated live train/tram positions, derived by interpolating the static
// GTFS timetable against the current time - PTV's realtime feed carries no
// vehicle GPS positions for this network, so this is the actual source of
// the "live" vehicle icons on the map. Ported from
// server/services/train_simulation_service.py.
import { calculateBearing } from './geo';
import { projectPointToPolyline, pointAtArcLength, slicePolylineByArcLength, type Point } from './geometry';
import { getMelbourneNow, oneServiceDayEarlier } from './melbourneTime';
import {
  getVehicleSim,
  getStops,
  getRoutes,
  getShapeData,
  weekdayNameFromIndex,
  DEFAULT_TRAIN_COLOR,
  DEFAULT_TRAM_COLOR,
  type StopRow,
  type RouteRow,
  type ShapeData,
} from './staticData';

const TRAIN_ROUTE_TYPE = 400;
const TRAM_ROUTE_TYPE = 0;
const STEP_SECONDS = 4;

export type VehicleMode = 'all' | 'train' | 'tram';

export interface VehiclePosition {
  trip_id: string;
  route_short_name: string;
  route_long_name: string;
  mode: 'train' | 'tram';
  color: string;
  lat: number;
  lon: number;
  bearing_deg: number;
  progress: number;
  path: Point[];
  status: 'dwelling' | 'in_transit';
  from_stop_id: string;
  to_stop_id: string;
  from_stop_name: string;
  to_stop_name: string;
  current_stop_id: string;
  current_stop_name: string;
  destination: string;
  direction_id: number | null;
  is_stopped: boolean;
}

export function cleanStationName(stopName: string): string {
  return stopName.replace(' Railway Station', '').replace(' Station', '');
}

function routeTypesForMode(mode: VehicleMode): number[] {
  if (mode === 'train') return [TRAIN_ROUTE_TYPE];
  if (mode === 'tram') return [TRAM_ROUTE_TYPE];
  return [TRAIN_ROUTE_TYPE, TRAM_ROUTE_TYPE];
}

function interpolatePosition(
  tripId: string,
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  progress: number,
  shapeData: ShapeData,
  progressNext: number
): { lat: number; lon: number; bearing: number; path: Point[] } {
  try {
    const shapeId = shapeData.tripShapeMap.get(tripId);
    const polyline = shapeId ? shapeData.shapePolylines.get(shapeId) : undefined;
    if (!polyline || polyline.length < 2) throw new Error('no shape');

    const fromProj = projectPointToPolyline([fromLon, fromLat], polyline);
    const toProj = projectPointToPolyline([toLon, toLat], polyline);
    if (!fromProj || !toProj) throw new Error('projection failed');

    const spanKm = toProj.arcLengthKm - fromProj.arcLengthKm;
    const targetKm = fromProj.arcLengthKm + spanKm * progress;
    const targetKmNext = fromProj.arcLengthKm + spanKm * progressNext;

    const result = pointAtArcLength(polyline, targetKm);
    if (!result) throw new Error('arc-length lookup failed');

    const path = slicePolylineByArcLength(polyline, targetKm, targetKmNext);
    const [snappedLon, snappedLat] = result.point;

    let bearing: number;
    if (path.length >= 2 && (path[0][0] !== path[1][0] || path[0][1] !== path[1][1])) {
      bearing = calculateBearing(path[0][1], path[0][0], path[1][1], path[1][0]);
    } else {
      bearing = result.bearingDeg;
    }

    return { lat: snappedLat, lon: snappedLon, bearing, path };
  } catch {
    const lat = fromLat + (toLat - fromLat) * progress;
    const lon = fromLon + (toLon - fromLon) * progress;
    const nextLat = fromLat + (toLat - fromLat) * progressNext;
    const nextLon = fromLon + (toLon - fromLon) * progressNext;
    const bearing = calculateBearing(fromLat, fromLon, toLat, toLon);
    return { lat, lon, bearing, path: [[lon, lat], [nextLon, nextLat]] };
  }
}

function lastStopPerTrip(segments: readonly (readonly [number, number, number | null, number | null, number, number, number, number | null])[], stops: StopRow[]): Map<number, string> {
  const best = new Map<number, { toSecs: number; name: string }>();
  for (const seg of segments) {
    const [tripIdx, , toSecs, , , toStopIdx] = seg;
    if (toSecs === null) continue;
    const current = best.get(tripIdx);
    if (!current || toSecs > current.toSecs) {
      best.set(tripIdx, { toSecs, name: cleanStationName(stops[toStopIdx][1]) });
    }
  }
  const result = new Map<number, string>();
  for (const [tripIdx, v] of best) result.set(tripIdx, v.name);
  return result;
}

export async function getActiveVehiclePositions(origin: string, mode: VehicleMode = 'all'): Promise<VehiclePosition[]> {
  const routeTypes = new Set(routeTypesForMode(mode));
  const [shapeData, stops, routes] = await Promise.all([
    getShapeData(origin, mode),
    getStops(origin),
    getRoutes(origin),
  ]);

  const today = getMelbourneNow();
  const yesterday = oneServiceDayEarlier(today);

  const candidates = [
    { weekday: weekdayNameFromIndex(today.weekdayIndex), nowSecs: today.secondsSinceMidnight },
    { weekday: weekdayNameFromIndex(yesterday.weekdayIndex), nowSecs: yesterday.secondsSinceMidnight },
  ];

  const byTrip = new Map<string, VehiclePosition>();

  for (const { weekday, nowSecs } of candidates) {
    const { trips, segments } = await getVehicleSim(origin, weekday);
    const destByTrip = lastStopPerTrip(segments, stops);

    for (const seg of segments) {
      const [tripIdx, fromSecs, toSecs, nextDepSecs, fromStopIdx, toStopIdx, routeIdx, directionId] = seg;

      const [, routeShortName, routeLongName, routeType]: RouteRow = routes[routeIdx];
      if (!routeTypes.has(routeType)) continue;
      const windowEnd = nextDepSecs ?? toSecs ?? -Infinity;
      if (!(fromSecs <= nowSecs && windowEnd >= nowSecs)) continue;

      const tripId = trips[tripIdx];
      const [fromStopId, fromStopName, fromLat, fromLon]: StopRow = stops[fromStopIdx];
      const [toStopId, toStopName, toLat, toLon]: StopRow = stops[toStopIdx];

      const vehMode: 'train' | 'tram' = routeType === TRAM_ROUTE_TYPE ? 'tram' : 'train';

      let status: 'dwelling' | 'in_transit';
      let progress: number;
      let progressNext: number;

      if (toSecs !== null && nowSecs >= toSecs && nextDepSecs !== null && nowSecs <= nextDepSecs) {
        status = 'dwelling';
        progress = 1.0;
        progressNext = 1.0;
      } else {
        status = 'in_transit';
        const span = toSecs !== null ? toSecs - fromSecs : 0;
        progress = span > 0 ? (nowSecs - fromSecs) / span : 0.0;
        progress = Math.max(0, Math.min(1, progress));
        progressNext = span > 0 ? (nowSecs + STEP_SECONDS - fromSecs) / span : 1.0;
        progressNext = Math.max(0, Math.min(1, progressNext));
      }

      const { lat, lon, bearing, path } = interpolatePosition(
        tripId, fromLat, fromLon, toLat, toLon, progress, shapeData, progressNext
      );

      const color =
        vehMode === 'tram'
          ? shapeData.routeColors.get(routeShortName) ?? DEFAULT_TRAM_COLOR
          : shapeData.routeColors.get(routeShortName) ?? DEFAULT_TRAIN_COLOR;

      const fromClean = cleanStationName(fromStopName);
      const toClean = cleanStationName(toStopName);
      const destination = destByTrip.get(tripIdx) ?? toClean;
      const isStopped = status === 'dwelling' || progress >= 0.96 || progress <= 0.04;
      const currStopId = progress >= 0.5 ? toStopId : fromStopId;
      const currStopName = progress >= 0.5 ? toClean : fromClean;

      byTrip.set(tripId, {
        trip_id: tripId,
        route_short_name: routeShortName,
        route_long_name: routeLongName,
        mode: vehMode,
        color,
        lat,
        lon,
        bearing_deg: bearing,
        progress,
        path,
        status,
        from_stop_id: String(fromStopId),
        to_stop_id: String(toStopId),
        from_stop_name: fromClean,
        to_stop_name: toClean,
        current_stop_id: String(currStopId),
        current_stop_name: currStopName,
        destination,
        direction_id: directionId,
        is_stopped: isStopped,
      });
    }
  }

  return [...byTrip.values()];
}

export function vehiclePositionsToGeoJSON(positions: VehiclePosition[]) {
  return {
    type: 'FeatureCollection' as const,
    features: positions.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
      properties: {
        trip_id: p.trip_id,
        route_short_name: p.route_short_name,
        route_long_name: p.route_long_name,
        mode: p.mode,
        color: p.color,
        bearing_deg: p.bearing_deg,
        progress: p.progress,
        path: p.path,
        status: p.status,
        from_stop_id: p.from_stop_id,
        to_stop_id: p.to_stop_id,
        from_stop_name: p.from_stop_name,
        to_stop_name: p.to_stop_name,
        current_stop_id: p.current_stop_id,
        current_stop_name: p.current_stop_name,
        destination: p.destination,
        direction_id: p.direction_id,
        is_stopped: p.is_stopped,
      },
    })),
  };
}
