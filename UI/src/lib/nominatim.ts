// Live OpenStreetMap Nominatim adapter, bounded to Victoria, Australia.
// Ported from geocoding/adapter.py's NominatimAdapter. Throttling/cache
// state lives at module scope, so it's shared across requests within one
// warm serverless instance (best-effort, same caveat as the Python
// in-process version - it doesn't coordinate across concurrent instances).

export interface NominatimPlace {
  lat: string;
  lon: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
  display_name?: string;
  osm_type?: string;
  osm_id?: string | number;
  name?: string;
  [k: string]: unknown;
}

const MIN_INTERVAL_MS = 1000;
const MAX_CACHE_ENTRIES = 500;

let lastRequestAt = 0;
const cache = new Map<string, NominatimPlace[]>();

function cacheKey(query: string, limit: number): string {
  return `${query.trim().toLowerCase()}::${limit}`;
}

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchPlaces(query: string, limit: number): Promise<NominatimPlace[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    `q=${encodeURIComponent(query)}` +
    `&format=jsonv2&addressdetails=1&limit=${limit}` +
    '&countrycodes=au&viewbox=140.9,-39.2,150.0,-33.9';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Motion-Transit-App/1.0 (https://github.com/lucidmach/Motion)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function searchPlaces(query: string, limit = 5): Promise<NominatimPlace[]> {
  const key = cacheKey(query, limit);
  const cached = cache.get(key);
  if (cached) {
    // Refresh LRU order.
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  await throttle();
  const results = await fetchPlaces(query, limit);

  cache.set(key, results);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return results;
}
