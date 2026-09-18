import type mapboxgl from 'mapbox-gl';
import type { MapLightPreset, ThemePresetId, ThemeSettings } from '../../types/settings';
import { DEFAULT_HUB } from './transitHub';
import {
  calculateNOAASolarTimes,
  calculateNOAASolarPosition,
  type SolarTimes,
  type SolarPosition
} from './solarCalculator';

// Pure neutral, hue-free daylight atmosphere shared across all daytime states
const NEUTRAL_DAY_FOG = {
  color: 'rgb(240, 243, 246)',
  'high-color': 'rgb(220, 228, 236)',
  'horizon-blend': 0.08,
  'space-color': 'rgb(235, 240, 248)',
  'star-intensity': 0.0
};

// Dark theme nighttime atmosphere palette with celestial starlight
const NIGHT_THEME_FOG = {
  color: 'rgb(12, 16, 22)',
  'high-color': 'rgb(20, 26, 36)',
  'horizon-blend': 0.08,
  'space-color': 'rgb(6, 9, 14)',
  'star-intensity': 0.92
};

export interface SolarState {
  isNight: boolean;
  azimuth: number; // 0..360 degrees
  polar: number; // 0..90 degrees from zenith
  intensity: number;
  lightPreset: MapLightPreset;
  timeMinutes: number;
  shadowDirectionAngle: number; // angle shadows point towards
  solarTimes: SolarTimes;
}

interface MapLightingStateCache {
  lastLightPreset?: MapLightPreset;
  lastIsNight?: boolean;
  hasInitializedBasemap?: boolean;
}

const mapLightingCache = new WeakMap<mapboxgl.Map, MapLightingStateCache>();

// Active coordinates reference for astronomical solar calculation (defaults to Flinders St Station)
let activeCoords: [number, number] = DEFAULT_HUB.coords;

if (typeof window !== 'undefined') {
  window.addEventListener('motion:location', (e: Event) => {
    const loc = (e as CustomEvent<{ latitude: number; longitude: number }>).detail;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      activeCoords = [loc.longitude, loc.latitude];
    }
  });
}

export function setActiveSolarCoordinates(lng: number, lat: number): void {
  activeCoords = [lng, lat];
}

export function getActiveSolarCoordinates(): [number, number] {
  return activeCoords;
}

/**
 * Computes exact continuous solar vectors, shadow directions, and daylight state
 * for any given minute of the 24-hour diurnal day using NOAA Astronomical Algorithms.
 */
export function calculateSolarState(
  timeMinutesInput?: number,
  presetFallback: MapLightPreset = 'day',
  customCoords?: [number, number],
  date: Date = new Date()
): SolarState {
  const [lng, lat] = customCoords || activeCoords;
  const solarTimes = calculateNOAASolarTimes(lat, lng, date);

  let timeMinutes = timeMinutesInput;

  if (typeof timeMinutes !== 'number') {
    switch (presetFallback) {
      case 'dawn':
        timeMinutes = solarTimes.dawnMinutes;
        break;
      case 'dusk':
        timeMinutes = solarTimes.duskMinutes;
        break;
      case 'night':
        timeMinutes = (solarTimes.duskMinutes + 120) % 1440;
        break;
      case 'day':
      default:
        timeMinutes = solarTimes.solarNoonMinutes;
        break;
    }
  }

  // Bound to 0..1440
  timeMinutes = ((timeMinutes % 1440) + 1440) % 1440;

  // Use NOAA solar position calculation
  const pos = calculateNOAASolarPosition(lat, lng, timeMinutes, date);

  // Determine lightPreset based on real astronomical twilight and sunrise/sunset
  let lightPreset: MapLightPreset = 'day';
  if (timeMinutes >= solarTimes.dawnMinutes && timeMinutes < solarTimes.sunriseMinutes + 45) {
    lightPreset = 'dawn';
  } else if (timeMinutes >= solarTimes.sunsetMinutes - 45 && timeMinutes <= solarTimes.duskMinutes + 30) {
    lightPreset = 'dusk';
  } else if (!pos.isNight) {
    lightPreset = 'day';
  } else {
    lightPreset = 'night';
  }

  // Calculate realistic light intensity
  let intensity = 0.4;
  if (!pos.isNight) {
    const elevationFraction = Math.max(0, Math.sin((pos.elevation * Math.PI) / 180));
    intensity = Math.round((0.70 + 0.25 * elevationFraction) * 100) / 100;
  }

  return {
    isNight: pos.isNight,
    azimuth: pos.azimuth,
    polar: pos.polar,
    intensity,
    lightPreset,
    timeMinutes,
    shadowDirectionAngle: pos.shadowDirectionAngle,
    solarTimes
  };
}

/**
 * Applies continuous dynamic daylight rendering and real-time rotating 3D building shadows.
 * Performance-optimized: bypasses redundant style tree re-evaluations and updates GPU lights directly.
 */
export function applyMap3DLightingAndShadows(map: mapboxgl.Map, settings: ThemeSettings): void {
  if (!map) return;

  let cache = mapLightingCache.get(map);
  if (!cache) {
    cache = {};
    mapLightingCache.set(map, cache);
  }

  const solar = calculateSolarState(settings.timeMinutes, settings.lightPreset);
  const shadowIntensity = typeof settings.shadowIntensity === 'number' ? settings.shadowIntensity : 0.85;

  // 1. Atmosphere / Fog (ONLY mutate when transitioning across day/night boundaries)
  if (cache.lastIsNight !== solar.isNight) {
    cache.lastIsNight = solar.isNight;
    try {
      if (typeof map.setFog === 'function') {
        map.setFog(solar.isNight ? NIGHT_THEME_FOG : NEUTRAL_DAY_FOG);
      }
    } catch (e) {
      // Handled gracefully
    }
  }

  // 2. Mapbox Standard Basemap configuration (ONLY update on init or lightPreset phase change)
  const mapAny = map as any;
  if (typeof mapAny.setConfigProperty === 'function') {
    try {
      if (!cache.hasInitializedBasemap) {
        mapAny.setConfigProperty('basemap', 'theme', 'monochrome');
        mapAny.setConfigProperty('basemap', 'show3dObjects', true);
        mapAny.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
        mapAny.setConfigProperty('basemap', 'showTransitLabels', true);
        cache.hasInitializedBasemap = true;
      }

      if (cache.lastLightPreset !== solar.lightPreset) {
        cache.lastLightPreset = solar.lightPreset;
        mapAny.setConfigProperty('basemap', 'lightPreset', solar.lightPreset);
      }
    } catch (e) {
      console.warn('[MapThemeCustomizer] Standard basemap config note:', e);
    }
  }

  // 3. Ultra-fast GPU Directional 3D Sunlight & Shadow updates (60-120 FPS)
  try {
    if (typeof mapAny.setLights === 'function') {
      if (!solar.isNight && shadowIntensity > 0) {
        mapAny.setLights([
          {
            id: 'directional_sun',
            type: 'directional',
            properties: {
              color: '#ffffff',
              direction: [solar.azimuth, solar.polar],
              intensity: solar.intensity,
              'cast-shadows': true,
              'shadow-intensity': Math.max(0.05, Math.min(1.0, shadowIntensity))
            }
          },
          {
            id: 'ambient_sky',
            type: 'ambient',
            properties: {
              color: '#ffffff',
              intensity: 0.35
            }
          }
        ]);
      } else {
        mapAny.setLights([
          {
            id: 'ambient_night',
            type: 'ambient',
            properties: {
              color: '#152035',
              intensity: 0.4
            }
          }
        ]);
      }
    }
  } catch (e) {
    // Graceful fallback for non-3D styles
  }

  // Force immediate repaint on the active frame without waiting for idle
  try {
    map.triggerRepaint();
  } catch (e) {}
}

/**
 * Backward-compatibility helper
 */
export function applyMapSeasonalPalette(map: mapboxgl.Map, presetId: ThemePresetId): void {
  applyMap3DLightingAndShadows(map, {
    presetId,
    lightPreset: 'day',
    timeMinutes: 720,
    mapStyle: 'standard',
    glassIntensity: 'standard',
    showGlow: true
  });
}
