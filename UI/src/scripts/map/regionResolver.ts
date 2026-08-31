import { VICTORIAN_REGIONS, type RegionZone } from './regions.data';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function resolveRegionInFocus(lng: number, lat: number, zoom: number): string {
  if (zoom < 9.0) {
    if (lat >= -39.2 && lat <= -34.0 && lng >= 140.9 && lng <= 150.0) {
      return 'Victoria • Regional Transit Network';
    }
    return 'Victorian Transit • 3D Navigator';
  }

  if (zoom < 11.8) {
    if (lat >= -38.3 && lat <= -37.5 && lng >= 144.6 && lng <= 145.5) return 'Greater Melbourne • Transit Network';
    if (lat >= -38.25 && lat <= -38.05 && lng >= 144.25 && lng <= 144.55) return 'Geelong & Bellarine • Regional Network';
    if (lat >= -37.7 && lat <= -37.4 && lng >= 143.7 && lng <= 144.0) return 'Ballarat & Goldfields • Regional Network';
    if (lat >= -36.9 && lat <= -36.6 && lng >= 144.15 && lng <= 144.45) return 'Bendigo & Loddon • Regional Network';
    return 'Victoria • Multi-Modal Transit';
  }

  for (const region of VICTORIAN_REGIONS) {
    if (region.bounds) {
      const [minLng, minLat, maxLng, maxLat] = region.bounds;
      if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
        return region.name;
      }
    }
  }

  let nearestRegion: RegionZone | null = null;
  let minDistance = Infinity;

  for (const region of VICTORIAN_REGIONS) {
    if (region.center) {
      const dist = calculateDistanceKm(lat, lng, region.center[1], region.center[0]);
      const maxAllowed = region.radiusKm || 2.5;
      if (dist <= maxAllowed && dist < minDistance) {
        minDistance = dist;
        nearestRegion = region;
      }
    }
  }

  if (nearestRegion) return nearestRegion.name;

  if (lat >= -38.05 && lat <= -37.65 && lng >= 144.8 && lng <= 145.25) {
    return 'Melbourne Metropolitan Transit Area';
  }

  return 'Victorian Transit Network';
}
