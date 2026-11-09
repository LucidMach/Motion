// Shared geo/GTFS primitives used by the API routes under src/pages/api/.
// Ported from the Python directional_routing.py shared-utils module.

export const WALKING_SPEED_KMH = 5.0;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Bearing from point 1 to point 2, in degrees (0-360). */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const diffLong = ((lon2 - lon1) * Math.PI) / 180;

  const x = Math.sin(diffLong) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(diffLong);

  const initialBearing = (Math.atan2(x, y) * 180) / Math.PI;
  return (initialBearing + 360) % 360;
}

export function walkingTimeMins(distanceKm: number): number {
  return (distanceKm / WALKING_SPEED_KMH) * 60.0;
}

/** Maps GTFS standard and extended Hierarchical Route Type (HVT) codes to readable mode labels. */
export function getModeName(routeType: number | string | null | undefined): string {
  if (routeType === null || routeType === undefined) return 'Transit';
  const rt = Number(routeType);
  if (Number.isNaN(rt)) return 'Transit';

  if (rt === 0 || (rt >= 900 && rt <= 999)) return 'Tram';
  if (rt === 1 || rt === 2 || (rt >= 100 && rt <= 199) || (rt >= 400 && rt <= 499)) return 'Train';
  if (rt === 3 || (rt >= 200 && rt <= 299) || (rt >= 700 && rt <= 899)) return 'Bus';
  if (rt === 4 || (rt >= 1000 && rt <= 1099)) return 'Ferry';
  if (rt === 5) return 'Cable Tram';
  if (rt === 6) return 'Gondola';
  if (rt === 7) return 'Funicular';
  return 'Transit';
}
