// Ranked autocomplete search across curated landmarks, GTFS stops, and live
// OpenStreetMap Nominatim geocoding. Ported from geocoding/core.py's
// search() (the only function from that module still called live -
// geocode_address/resolve_stop_coords had no callers left once the
// point-to-point routing engine was removed).
import { getStops, type StopRow } from './staticData';
import { searchLandmarks } from './landmarks';
import { searchPlaces, type NominatimPlace } from './nominatim';

export interface Place {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  street_name?: string | null;
  mode: string;
}

function classifyGtfsStop(stopName: string): string {
  const lower = stopName.toLowerCase();
  if (lower.includes('station') || lower.includes('railway')) return 'Train Station';
  if (lower.includes('tram')) return 'Tram Stop';
  if (lower.includes('bus') || lower.includes('interchange')) return 'Bus Stop';
  if (stopName.includes('/')) {
    return stopName.includes('St') || stopName.includes('Rd') ? 'Tram Stop' : 'Transit Stop';
  }
  return 'Transit Stop';
}

function stripHouseNumber(rawName: string): string {
  const cleaned = rawName.replace(/^\d+[\w/-]*\s+/, '').trim();
  return cleaned || rawName;
}

function splitDisplayName(stopName: string): [string, string | null] {
  if (stopName.includes('/')) {
    const idx = stopName.indexOf('/');
    const display = stopName.slice(0, idx).trim();
    const street = stopName.slice(idx + 1).trim().replace(/[()]/g, '');
    return [display, street];
  }
  return [stopName, null];
}

function classifyOsmPlace(item: NominatimPlace): string {
  const category = item.category ?? '';
  const type = item.type ?? '';
  if (type === 'station' || type === 'halt' || (category === 'railway' && type !== 'tram_stop')) return 'Train Station';
  if (type === 'tram_stop' || type === 'tram' || category === 'tram') return 'Tram Stop';
  if (type === 'bus_stop' || type === 'bus_station' || type === 'platform' || category === 'bus') return 'Bus Stop';
  if (type === 'ferry_terminal' || type === 'ferry') return 'Ferry Terminal';
  if (type === 'university' || type === 'college' || type === 'school' || category === 'education' || category === 'campus') return 'Campus / Landmark';
  if (['amenity', 'building', 'tourism', 'leisure', 'office', 'shop'].includes(category)) return 'Building / Landmark';
  if (type === 'administrative' || category === 'boundary') return 'Suburb / Region';
  return 'Address / Location';
}

function osmPlaceToPlace(item: NominatimPlace, fallbackName: string): Place | null {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const addr = item.address ?? {};
  let rawName = item.name || addr.building || addr.amenity;
  if (!rawName) {
    const parts = (item.display_name ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    rawName = parts[0] || fallbackName;
  }

  const road = addr.road || addr.pedestrian || addr.street || '';
  const suburb = addr.suburb || addr.neighbourhood || addr.city || addr.town || '';
  const streetParts = [road, suburb].filter(Boolean);

  return {
    stop_id: `osm:${item.osm_type ?? 'node'}:${item.osm_id ?? ''}`,
    stop_name: stripHouseNumber(rawName),
    street_name: streetParts.length ? streetParts.join(', ') : null,
    stop_lat: lat,
    stop_lon: lon,
    mode: classifyOsmPlace(item),
  };
}

function getModeTier(mode: string): number {
  const lower = mode.toLowerCase();
  if (['building', 'landmark', 'campus', 'university', 'college', 'school', 'faculty'].some((k) => lower.includes(k))) return 1;
  if (['train', 'rail', 'railway', 'station'].some((k) => lower.includes(k))) return 2;
  if (lower.includes('tram')) return 3;
  if (['bus', 'interchange', 'ferry', 'transit'].some((k) => lower.includes(k))) return 4;
  return 5;
}

function matchScore(query: string, name: string): number {
  const q = query.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (!q || !n) return 5;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = n.match(/[\w]+/g) ?? [];
  if (words.some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return 4;
}

function stopKey(displayName: string): string {
  return displayName.toLowerCase().replace(' railway station', '').replace(' station', '').trim();
}

/**
 * Ranked autocomplete search prioritizing user-centric destinations:
 * Tier 1: Buildings, Universities, Campuses & Curated Landmarks
 * Tier 2: Train & Railway Stations
 * Tier 3: Tram Stops & Light Rail
 * Tier 4: Bus Stops, Interchanges & Ferry Terminals
 * Tier 5: Suburbs, Regions & General Addresses
 */
export async function search(origin: string, query: string, limit = 10): Promise<Place[]> {
  const normQuery = query.trim().toLowerCase();
  if (!normQuery) return [];

  const candidates: Place[] = [];
  const seen = new Set<string>();

  // 1. Curated landmarks.
  for (const lm of searchLandmarks(query)) {
    const key = lm.names[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      stop_id: `landmark:${lm.names[0].replace(/ /g, '_')}`,
      stop_name: lm.names[0].replace(/\b\w/g, (c) => c.toUpperCase()),
      street_name: lm.street,
      stop_lat: lm.lat,
      stop_lon: lm.lon,
      mode: lm.mode,
    });
  }

  // 2. GTFS stops - ranked the same way the SQL LIKE query did: substring
  // match required, exact-prefix-match and shorter names ranked first.
  const stops = await getStops(origin);
  const lowerQuery = query.toLowerCase();
  const matches: StopRow[] = stops.filter(([, stopName]) => stopName.toLowerCase().includes(lowerQuery));
  matches.sort((a, b) => {
    const aPrefix = a[1].toLowerCase().startsWith(lowerQuery) ? 0 : 1;
    const bPrefix = b[1].toLowerCase().startsWith(lowerQuery) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a[1].length - b[1].length;
  });

  for (const [stopId, stopName, lat, lon] of matches.slice(0, Math.max(limit * 3, 30))) {
    if (lat === null || lon === null) continue;
    const [displayName, street] = splitDisplayName(stopName);
    const key = stopKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      stop_id: stopId,
      stop_name: displayName,
      street_name: street,
      stop_lat: lat,
      stop_lon: lon,
      mode: classifyGtfsStop(stopName),
    });
  }

  // 3. Live OpenStreetMap geocoding.
  if (candidates.length < limit) {
    const places = await searchPlaces(query, Math.max(limit, 5));
    for (const item of places) {
      const place = osmPlaceToPlace(item, query);
      if (!place) continue;
      const key = stopKey(place.stop_name);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(place);
    }
  }

  candidates.sort((a, b) => {
    const tierDiff = getModeTier(a.mode) - getModeTier(b.mode);
    if (tierDiff !== 0) return tierDiff;
    const scoreDiff = matchScore(query, a.stop_name) - matchScore(query, b.stop_name);
    if (scoreDiff !== 0) return scoreDiff;
    const lenDiff = a.stop_name.length - b.stop_name.length;
    if (lenDiff !== 0) return lenDiff;
    return a.stop_name.toLowerCase().localeCompare(b.stop_name.toLowerCase());
  });

  return candidates.slice(0, limit);
}
