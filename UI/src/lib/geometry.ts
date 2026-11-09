// Polyline projection/arc-length math for snapping a simulated vehicle to its
// track shape. Ported from server/services/geometry_utils.py.
import { haversine, calculateBearing } from './geo';

export type Point = [number, number]; // [lon, lat]

const METERS_PER_DEGREE_LAT = 110540.0;
const METERS_PER_DEGREE_LON_AT_EQUATOR = 111320.0;

function segmentLengthKm(a: Point, b: Point): number {
  return haversine(a[1], a[0], b[1], b[0]);
}

export interface ProjectionResult {
  point: Point;
  arcLengthKm: number;
  bearingDeg: number;
}

/** Nearest point on `polyline` to `point`, with cumulative arc-length and local bearing. */
export function projectPointToPolyline(point: Point, polyline: Point[]): ProjectionResult | null {
  if (polyline.length < 2) return null;

  let best: { dist: number; arcLengthKm: number; point: Point; bearingDeg: number } | null = null;
  let cumulativeKm = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLenKm = segmentLengthKm(a, b);

    const lat0Rad = (a[1] * Math.PI) / 180;
    const metersPerDegLon = METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos(lat0Rad);

    const bx = (b[0] - a[0]) * metersPerDegLon;
    const by = (b[1] - a[1]) * METERS_PER_DEGREE_LAT;
    const pxm = (point[0] - a[0]) * metersPerDegLon;
    const pym = (point[1] - a[1]) * METERS_PER_DEGREE_LAT;

    const segLenMSq = bx * bx + by * by;
    let t = segLenMSq === 0 ? 0 : (pxm * bx + pym * by) / segLenMSq;
    t = Math.max(0, Math.min(1, t));

    const candLon = metersPerDegLon ? a[0] + (t * bx) / metersPerDegLon : a[0];
    const candLat = a[1] + (t * by) / METERS_PER_DEGREE_LAT;

    const distKm = haversine(point[1], point[0], candLat, candLon);

    if (best === null || distKm < best.dist) {
      best = {
        dist: distKm,
        arcLengthKm: cumulativeKm + t * segLenKm,
        point: [candLon, candLat],
        bearingDeg: calculateBearing(a[1], a[0], b[1], b[0]),
      };
    }

    cumulativeKm += segLenKm;
  }

  if (!best) return null;
  return { point: best.point, arcLengthKm: best.arcLengthKm, bearingDeg: best.bearingDeg };
}

export interface ArcLengthResult {
  point: Point;
  bearingDeg: number;
}

/** Inverse of projectPointToPolyline: the point (and local bearing) at `targetKm` along the polyline. */
export function pointAtArcLength(polyline: Point[], targetKm: number): ArcLengthResult | null {
  if (polyline.length < 2) return null;

  const segmentLengthsKm: number[] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    segmentLengthsKm.push(segmentLengthKm(polyline[i], polyline[i + 1]));
  }
  const totalKm = segmentLengthsKm.reduce((a, b) => a + b, 0);
  const clamped = Math.max(0, Math.min(totalKm, targetKm));

  let cumulativeKm = 0;
  for (let i = 0; i < segmentLengthsKm.length; i++) {
    const segLenKm = segmentLengthsKm[i];
    const isLastSegment = i === segmentLengthsKm.length - 1;
    if (clamped <= cumulativeKm + segLenKm || isLastSegment) {
      const a = polyline[i];
      const b = polyline[i + 1];
      let t = segLenKm === 0 ? 0 : (clamped - cumulativeKm) / segLenKm;
      t = Math.max(0, Math.min(1, t));
      const lon = a[0] + (b[0] - a[0]) * t;
      const lat = a[1] + (b[1] - a[1]) * t;
      return { point: [lon, lat], bearingDeg: calculateBearing(a[1], a[0], b[1], b[0]) };
    }
    cumulativeKm += segLenKm;
  }

  return null;
}

/**
 * Ordered sub-polyline between startKm and endKm (measured from polyline[0]),
 * inclusive of intermediate shape vertices. Handles reverse traversal
 * (startKm > endKm) and clamps to [0, totalLength].
 */
export function slicePolylineByArcLength(polyline: Point[], startKm: number, endKm: number): Point[] {
  if (polyline.length < 2) return polyline.map((p) => [p[0], p[1]] as Point);

  const segmentLengthsKm: number[] = [];
  for (let i = 0; i < polyline.length - 1; i++) {
    segmentLengthsKm.push(segmentLengthKm(polyline[i], polyline[i + 1]));
  }
  const totalKm = segmentLengthsKm.reduce((a, b) => a + b, 0);

  const isReverse = startKm > endKm;
  const sKm = Math.max(0, Math.min(totalKm, isReverse ? endKm : startKm));
  const eKm = Math.max(0, Math.min(totalKm, isReverse ? startKm : endKm));

  const coordAt = (target: number): Point => {
    let cum = 0;
    for (let i = 0; i < segmentLengthsKm.length; i++) {
      const sLen = segmentLengthsKm[i];
      const isLast = i === segmentLengthsKm.length - 1;
      if (target <= cum + sLen || isLast) {
        let t = sLen === 0 ? 0 : (target - cum) / sLen;
        t = Math.max(0, Math.min(1, t));
        const a = polyline[i];
        const b = polyline[i + 1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      cum += sLen;
    }
    const last = polyline[polyline.length - 1];
    return [last[0], last[1]];
  };

  if (Math.abs(sKm - eKm) < 1e-7) {
    const pt = coordAt(sKm);
    return [pt, pt];
  }

  const startPt = coordAt(sKm);
  const endPt = coordAt(eKm);

  const points: Point[] = [startPt];
  let cum = 0;
  for (let i = 0; i < segmentLengthsKm.length; i++) {
    const sLen = segmentLengthsKm[i];
    const vDist = cum + sLen;
    if (vDist > sKm && vDist < eKm && Math.abs(vDist - sKm) > 1e-7 && Math.abs(vDist - eKm) > 1e-7) {
      const next = polyline[i + 1];
      points.push([next[0], next[1]]);
    }
    cum += sLen;
  }
  points.push(endPt);

  if (isReverse) points.reverse();

  return points;
}
