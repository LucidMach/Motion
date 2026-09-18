import type { MapLightPreset, MapStyleId, MapStyleOption, ThemePreset, ThemePresetId, ThemeSettings } from '../../types/settings';
import { DEFAULT_THEME_SETTINGS } from '../../types/settings';

export const THEME_STORAGE_KEY = 'motion_theme_settings';

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  monochrome: {
    id: 'monochrome',
    label: 'Mapbox Monochrome',
    seasonBadge: 'Stealth',
    subtitle: 'High-contrast architectural monochrome with titanium slate HUD & crisp 3D geometry',
    primaryColor: '#f1f5f9',
    secondaryColor: '#94a3b8',
    deepBg: '#090b10',
    surfaceBg: 'rgba(15, 20, 28, 0.86)',
    surfaceElevated: 'rgba(24, 30, 42, 0.92)',
    surfaceHover: 'rgba(38, 46, 62, 0.95)',
    glowColor: 'rgba(241, 245, 249, 0.35)',
    accentCyan: '#f1f5f9',
    accentIndigo: '#94a3b8',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #e2e8f0 45%, #94a3b8 100%)',
    subtleBorder: 'rgba(241, 245, 249, 0.2)',
    defaultLightPreset: 'day'
  }
};

export const MAPBOX_STYLES: Record<MapStyleId, MapStyleOption> = {
  monochrome: {
    id: 'monochrome',
    label: 'Mapbox Monochrome 3D',
    tagline: 'Sleek architectural stealth styling with 3D buildings, dynamic lighting & landmarks',
    url: 'mapbox://styles/mapbox/standard',
    badge: 'Stealth 3D',
    is3DSupported: true
  },
  standard: {
    id: 'standard',
    label: 'Mapbox Standard 3D',
    tagline: 'Dynamic 3D buildings, real-time lighting & landmarks',
    url: 'mapbox://styles/mapbox/standard',
    badge: 'Standard 3D',
    is3DSupported: true
  },
  satellite: {
    id: 'satellite',
    label: 'Photorealistic 3D Satellite',
    tagline: 'High-res satellite aerial imagery with 3D structural models',
    url: 'mapbox://styles/mapbox/standard-satellite',
    badge: 'Satellite 3D',
    is3DSupported: true
  },
  dark: {
    id: 'dark',
    label: 'Minimalist Vector Dark',
    tagline: 'Dark vector tiles with crisp roads & subtle transit lines',
    url: 'mapbox://styles/mapbox/dark-v11',
    badge: 'Vector Dark',
    is3DSupported: false
  },
  light: {
    id: 'light',
    label: 'Architectural Vector Light',
    tagline: 'Clean high-contrast architectural daytime map',
    url: 'mapbox://styles/mapbox/light-v11',
    badge: 'Vector Light',
    is3DSupported: false
  },
  navigation: {
    id: 'navigation',
    label: 'Transit Navigation Night',
    tagline: 'High contrast transit corridors & route emphasis',
    url: 'mapbox://styles/mapbox/navigation-night-v1',
    badge: 'Transit',
    is3DSupported: false
  },
  outdoors: {
    id: 'outdoors',
    label: 'Topographic Terrain',
    tagline: 'Contour lines, elevation hillshading & natural topography',
    url: 'mapbox://styles/mapbox/outdoors-v12',
    badge: 'Topography',
    is3DSupported: false
  }
};

export function getCurrentLocalMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

let sessionInitialized = false;

export function getThemeSettings(): ThemeSettings {
  const currentLocalMinutes = getCurrentLocalMinutes();
  if (typeof window === 'undefined') {
    return {
      ...DEFAULT_THEME_SETTINGS,
      timeMinutes: currentLocalMinutes,
      syncWithRealTime: true
    };
  }
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      const initialSettings: ThemeSettings = {
        ...DEFAULT_THEME_SETTINGS,
        timeMinutes: currentLocalMinutes,
        syncWithRealTime: true
      };
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(initialSettings));
      sessionInitialized = true;
      return initialSettings;
    }
    const parsed = JSON.parse(raw);
    const resolvedPresetId = parsed.presetId === 'obsidian' ? 'matrix' : parsed.presetId;

    // Fresh application/page start always defaults to Live real-time sync
    let syncWithRealTime = true;
    if (sessionInitialized) {
      syncWithRealTime = typeof parsed.syncWithRealTime === 'boolean' ? parsed.syncWithRealTime : true;
    } else {
      sessionInitialized = true;
      syncWithRealTime = true;
    }

    const effectiveTimeMinutes = syncWithRealTime
      ? currentLocalMinutes
      : (typeof parsed.timeMinutes === 'number' ? parsed.timeMinutes : currentLocalMinutes);

    return {
      presetId: resolvedPresetId && THEME_PRESETS[resolvedPresetId as ThemePresetId] ? resolvedPresetId : DEFAULT_THEME_SETTINGS.presetId,
      lightPreset: parsed.lightPreset || DEFAULT_THEME_SETTINGS.lightPreset,
      timeMinutes: effectiveTimeMinutes,
      syncWithRealTime,
      mapStyle: parsed.mapStyle && MAPBOX_STYLES[parsed.mapStyle as MapStyleId] ? parsed.mapStyle : DEFAULT_THEME_SETTINGS.mapStyle,
      shadowIntensity: typeof parsed.shadowIntensity === 'number' ? parsed.shadowIntensity : DEFAULT_THEME_SETTINGS.shadowIntensity,
      glassIntensity: parsed.glassIntensity || DEFAULT_THEME_SETTINGS.glassIntensity,
      showGlow: typeof parsed.showGlow === 'boolean' ? parsed.showGlow : DEFAULT_THEME_SETTINGS.showGlow
    };
  } catch (e) {
    console.warn('[ThemeManager] Failed to read stored theme:', e);
    return {
      ...DEFAULT_THEME_SETTINGS,
      timeMinutes: currentLocalMinutes,
      syncWithRealTime: true
    };
  }
}

let lastAppliedPresetId: string | null = null;
let lastAppliedGlass: string | null = null;
let lastAppliedGlow: boolean | null = null;
let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function applyTheme(settings: ThemeSettings): void {
  if (typeof document === 'undefined') return;

  // Skip DOM property mutations if theme, glass, and glow haven't changed
  if (
    lastAppliedPresetId === settings.presetId &&
    lastAppliedGlass === settings.glassIntensity &&
    lastAppliedGlow === settings.showGlow
  ) {
    return;
  }

  lastAppliedPresetId = settings.presetId;
  lastAppliedGlass = settings.glassIntensity;
  lastAppliedGlow = settings.showGlow;

  const preset = THEME_PRESETS[settings.presetId] || THEME_PRESETS.monochrome;
  const root = document.documentElement;

  root.style.setProperty('--color-deep', preset.deepBg);
  root.style.setProperty('--color-surface', preset.surfaceBg);
  root.style.setProperty('--color-surface-elevated', preset.surfaceElevated);
  root.style.setProperty('--color-surface-hover', preset.surfaceHover);
  root.style.setProperty('--color-glow', settings.showGlow ? preset.glowColor : 'rgba(148, 163, 184, 0.15)');
  root.style.setProperty('--color-accent-cyan', preset.accentCyan);
  root.style.setProperty('--color-accent-indigo', preset.accentIndigo);
  root.style.setProperty('--color-brand-gradient', preset.brandGradient);
  root.style.setProperty('--color-subtle', preset.subtleBorder || 'rgba(148, 163, 184, 0.12)');

  if (settings.glassIntensity === 'subtle') {
    root.style.setProperty('--shadow-glass', '0 4px 16px 0 rgba(0, 0, 0, 0.25)');
  } else if (settings.glassIntensity === 'high') {
    root.style.setProperty('--shadow-glass', `0 12px 40px 0 rgba(0, 0, 0, 0.6), 0 0 30px ${preset.glowColor}`);
  } else {
    root.style.setProperty('--shadow-glass', '0 8px 32px 0 rgba(0, 0, 0, 0.45)');
  }

  root.setAttribute('data-theme', settings.presetId);

  // Update theme-color meta tag
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', preset.deepBg);
  }
}

export function saveThemeSettings(
  settings: ThemeSettings,
  options: { persistImmediate?: boolean } = {}
): void {
  if (typeof window === 'undefined') return;
  try {
    if (options.persistImmediate) {
      if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
    } else {
      if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
      persistDebounceTimer = setTimeout(() => {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {}
      }, 300);
    }
    applyTheme(settings);
    window.dispatchEvent(new CustomEvent('motion:theme-change', { detail: { settings } }));
  } catch (e) {
    console.error('[ThemeManager] Failed to save theme:', e);
  }
}
