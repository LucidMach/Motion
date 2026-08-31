// Free OpenStreetMap reverse geocoding service.
// Resolves coordinates into "suburb • street (building if available)"
// with spatial caching, request debouncing, and offline fallbacks.

export interface LocationParts {
  suburb?: string;
  street?: string;
  building?: string;
}

export interface GeocodeResult {
  formattedText: string;
  parts: LocationParts;
  source: 'nominatim' | 'photon' | 'cache' | 'fallback';
}

/**
 * Formats parsed location components into the standard HUD string:
 * Displays building name instead of street name if building is available:
 * `suburb • building` or `suburb • street`
 */
export function formatLocationText(parts: LocationParts): string {
  let suburb = parts.suburb?.trim();
  let street = parts.street?.trim();
  let building = parts.building?.trim();

  // If building is purely numbers/house-numbers (e.g. "120" or "120-122"), treat it as not a named building
  if (building && /^\d+[\w\s\/-]*$/.test(building)) {
    building = undefined;
  }

  // Deduplicate building if it repeats suburb exactly
  if (building && suburb && building.toLowerCase() === suburb.toLowerCase()) {
    building = undefined;
  }

  // Deduplicate street if it matches suburb
  if (street && suburb && street.toLowerCase() === suburb.toLowerCase()) {
    street = undefined;
  }

  // Display building name instead of street name if available
  const specificName = building || street;

  if (suburb && specificName) {
    return `${suburb} • ${specificName}`;
  }
  if (suburb) {
    return suburb;
  }
  if (specificName) {
    return specificName;
  }
  return '';
}


/**
 * OpenStreetMap Nominatim reverse geocoding parser
 */
async function fetchNominatim(lng: number, lat: number, signal?: AbortSignal): Promise<LocationParts | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: 'application/json'
    }
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.address) return null;

  const addr = data.address;

  // Extract Suburb / Neighbourhood
  const suburb =
    addr.neighbourhood ||
    addr.suburb ||
    addr.city_district ||
    addr.quarter ||
    addr.borough ||
    addr.municipality ||
    addr.town ||
    addr.village ||
    addr.city;

  // Extract Street
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.highway ||
    addr.footway ||
    addr.street ||
    addr.path;

  // Extract Building / Landmark / POI
  let building =
    addr.building ||
    addr.amenity ||
    addr.tourism ||
    addr.historic ||
    addr.leisure ||
    addr.commercial ||
    addr.office ||
    addr.shop ||
    data.name;

  // If building is a generic road/suburb type or house number, clear it
  if (building && (building === street || building === suburb || /^\d+[\w\s-]*$/.test(building))) {
    building = undefined;
  }

  return { suburb, street, building };
}

/**
 * Photon (Komoot OSM) fallback parser
 */
async function fetchPhoton(lng: number, lat: number, signal?: AbortSignal): Promise<LocationParts | null> {
  const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;

  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature || !feature.properties) return null;

  const p = feature.properties;
  const suburb = p.district || p.locality || p.city || p.county;
  const street = p.street;
  let building = p.name;

  if (building && (building === street || building === suburb)) {
    building = undefined;
  }

  return { suburb, street, building };
}

export class ReverseGeocodingService {
  private cache = new Map<string, string>();
  private activeAbortController: AbortController | null = null;
  private maxCacheSize = 200;

  /**
   * Spatial cache key rounded to 4 decimals (~11m precision)
   */
  private getCacheKey(lng: number, lat: number): string {
    return `${lng.toFixed(4)},${lat.toFixed(4)}`;
  }

  /**
   * Resolves coordinates to a formatted location string.
   * If offline or during network latency, falls back to fallbackRegion.
   */
  async resolveLocation(
    lng: number,
    lat: number,
    zoom: number,
    fallbackRegion: string
  ): Promise<string> {
    const cacheKey = this.getCacheKey(lng, lat);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // For wide overviews (e.g. statewide zoom < 10), regional naming is more descriptive than a random road
    if (zoom < 10.0) {
      this.addToCache(cacheKey, fallbackRegion);
      return fallbackRegion;
    }

    // Cancel pending in-flight request
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    try {
      // 1. Try OpenStreetMap Nominatim
      let parts: LocationParts | null = null;
      try {
        parts = await fetchNominatim(lng, lat, signal);
      } catch (err: any) {
        if (err.name === 'AbortError') return '';
      }

      // 2. Fallback to Photon if Nominatim returned nothing
      if (!parts || (!parts.suburb && !parts.street)) {
        try {
          parts = await fetchPhoton(lng, lat, signal);
        } catch (err: any) {
          if (err.name === 'AbortError') return '';
        }
      }

      if (parts) {
        const formatted = formatLocationText(parts);
        if (formatted) {
          this.addToCache(cacheKey, formatted);
          return formatted;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return '';
      console.warn('[ReverseGeocoder] Geocoding lookup notice:', err);
    }

    // 3. Fallback to local region resolver if external APIs are unreachable
    this.addToCache(cacheKey, fallbackRegion);
    return fallbackRegion;
  }

  private addToCache(key: string, value: string): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  cancel(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }
}
