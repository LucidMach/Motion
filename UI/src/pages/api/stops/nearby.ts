import type { APIRoute } from 'astro';
import { getStops } from '../../../lib/staticData';
import { haversine, walkingTimeMins } from '../../../lib/geo';

export const prerender = false;

interface NearbyResult {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  distance_km: number;
  walk_time_mins: number;
  mode: string;
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  const radiusKm = Math.min(10, Math.max(0.1, Number(url.searchParams.get('radius_km')) || 1.5));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return new Response(JSON.stringify({ detail: 'lat and lon are required' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: NearbyResult[] = [];
  try {
    const stops = await getStops(url.origin);
    // Pre-filter with a generous bounding box before the precise haversine
    // check below, matching server/routes/stops.py's approach.
    const padDeg = (radiusKm / 111.0) * 1.5;

    const candidates: NearbyResult[] = [];
    for (const [stopId, stopName, stopLat, stopLon] of stops) {
      if (stopLat === null || stopLon === null) continue;
      if (stopLat < lat - padDeg || stopLat > lat + padDeg || stopLon < lon - padDeg || stopLon > lon + padDeg) continue;

      const dist = haversine(lat, lon, stopLat, stopLon);
      if (dist <= radiusKm) {
        candidates.push({
          stop_id: stopId,
          stop_name: stopName.replace(' Railway Station', '').replace(' Station', ''),
          stop_lat: stopLat,
          stop_lon: stopLon,
          distance_km: Math.round(dist * 100) / 100,
          walk_time_mins: Math.round(walkingTimeMins(dist) * 10) / 10,
          mode: 'Transit Stop',
        });
      }
    }

    candidates.sort((a, b) => a.distance_km - b.distance_km);
    results.push(...candidates.slice(0, limit));
  } catch (err) {
    console.warn('[stops/nearby] query note:', err);
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
};
