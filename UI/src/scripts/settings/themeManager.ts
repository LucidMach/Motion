import type { MapLightPreset, MapStyleId, MapStyleOption, ThemePreset, ThemePresetId, ThemeSettings } from '../../types/settings';
import { DEFAULT_THEME_SETTINGS } from '../../types/settings';

export const THEME_STORAGE_KEY = 'motion_theme_settings';

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk Cyan',
    seasonBadge: 'Default',
    subtitle: 'Midnight navy backdrop with luminous cyber cyan & electric indigo glow',
    primaryColor: '#38bdf8',
    secondaryColor: '#818cf8',
    deepBg: '#05070d',
    surfaceBg: 'rgba(10, 15, 29, 0.82)',
    surfaceElevated: 'rgba(16, 24, 46, 0.88)',
    surfaceHover: 'rgba(28, 41, 75, 0.92)',
    glowColor: 'rgba(56, 189, 248, 0.4)',
    accentCyan: '#38bdf8',
    accentIndigo: '#818cf8',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #38bdf8 55%, #818cf8 100%)',
    subtleBorder: 'rgba(56, 189, 248, 0.15)',
    defaultLightPreset: 'day'
  },
  spring: {
    id: 'spring',
    label: 'Spring Blossom',
    seasonBadge: '🌸 Spring',
    subtitle: 'Sakura cherry blossom rose & fresh emerald bud green on botanical moss slate',
    primaryColor: '#34d399',
    secondaryColor: '#f472b6',
    deepBg: '#06120b',
    surfaceBg: 'rgba(10, 28, 18, 0.85)',
    surfaceElevated: 'rgba(16, 44, 28, 0.9)',
    surfaceHover: 'rgba(26, 64, 40, 0.95)',
    glowColor: 'rgba(52, 211, 153, 0.4)',
    accentCyan: '#34d399',
    accentIndigo: '#f472b6',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #34d399 45%, #f472b6 100%)',
    subtleBorder: 'rgba(52, 211, 153, 0.18)',
    defaultLightPreset: 'day'
  },
  summer: {
    id: 'summer',
    label: 'Summer Solstice',
    seasonBadge: '☀️ Summer',
    subtitle: 'Sunlit Mediterranean azure skies with radiant solar sunburst gold',
    primaryColor: '#38bdf8',
    secondaryColor: '#fbbf24',
    deepBg: '#040d1c',
    surfaceBg: 'rgba(8, 24, 52, 0.85)',
    surfaceElevated: 'rgba(14, 38, 80, 0.9)',
    surfaceHover: 'rgba(22, 54, 110, 0.95)',
    glowColor: 'rgba(251, 191, 36, 0.4)',
    accentCyan: '#38bdf8',
    accentIndigo: '#fbbf24',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #38bdf8 45%, #fbbf24 100%)',
    subtleBorder: 'rgba(56, 189, 248, 0.18)',
    defaultLightPreset: 'day'
  },
  autumn: {
    id: 'autumn',
    label: 'Autumn Ember',
    seasonBadge: '🍁 Autumn',
    subtitle: 'Warm maple copper, harvest timber & terracotta crimson twilight ember',
    primaryColor: '#fb923c',
    secondaryColor: '#f43f5e',
    deepBg: '#140905',
    surfaceBg: 'rgba(32, 16, 10, 0.85)',
    surfaceElevated: 'rgba(48, 24, 14, 0.9)',
    surfaceHover: 'rgba(70, 36, 20, 0.95)',
    glowColor: 'rgba(251, 146, 60, 0.4)',
    accentCyan: '#fb923c',
    accentIndigo: '#f43f5e',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #fb923c 45%, #f43f5e 100%)',
    subtleBorder: 'rgba(251, 146, 60, 0.18)',
    defaultLightPreset: 'day'
  },
  winter: {
    id: 'winter',
    label: 'Winter Aurora',
    seasonBadge: '❄️ Winter',
    subtitle: 'Glacial frost turquoise & shimmering polar borealis violet on frosted obsidian',
    primaryColor: '#67e8f9',
    secondaryColor: '#c084fc',
    deepBg: '#040714',
    surfaceBg: 'rgba(10, 18, 38, 0.85)',
    surfaceElevated: 'rgba(18, 30, 64, 0.9)',
    surfaceHover: 'rgba(28, 46, 96, 0.95)',
    glowColor: 'rgba(103, 232, 249, 0.4)',
    accentCyan: '#67e8f9',
    accentIndigo: '#c084fc',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #67e8f9 45%, #c084fc 100%)',
    subtleBorder: 'rgba(103, 232, 249, 0.18)',
    defaultLightPreset: 'day'
  },
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian Stealth',
    seasonBadge: 'Stealth',
    subtitle: 'Deep pitch black stealth canvas with matrix emerald & mint telemetry',
    primaryColor: '#10b981',
    secondaryColor: '#14b8a6',
    deepBg: '#020408',
    surfaceBg: 'rgba(6, 14, 12, 0.85)',
    surfaceElevated: 'rgba(10, 24, 20, 0.9)',
    surfaceHover: 'rgba(16, 38, 30, 0.95)',
    glowColor: 'rgba(16, 185, 129, 0.35)',
    accentCyan: '#10b981',
    accentIndigo: '#14b8a6',
    brandGradient: 'linear-gradient(90deg, #ffffff 0%, #10b981 55%, #14b8a6 100%)',
    subtleBorder: 'rgba(16, 185, 129, 0.15)',
    defaultLightPreset: 'day'
  }
};

export const MAPBOX_STYLES: Record<MapStyleId, MapStyleOption> = {
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

export function getThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(DEFAULT_THEME_SETTINGS));
      return DEFAULT_THEME_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      presetId: parsed.presetId && THEME_PRESETS[parsed.presetId as ThemePresetId] ? parsed.presetId : DEFAULT_THEME_SETTINGS.presetId,
      lightPreset: parsed.lightPreset || DEFAULT_THEME_SETTINGS.lightPreset,
      mapStyle: parsed.mapStyle && MAPBOX_STYLES[parsed.mapStyle as MapStyleId] ? parsed.mapStyle : DEFAULT_THEME_SETTINGS.mapStyle,
      glassIntensity: parsed.glassIntensity || DEFAULT_THEME_SETTINGS.glassIntensity,
      showGlow: typeof parsed.showGlow === 'boolean' ? parsed.showGlow : DEFAULT_THEME_SETTINGS.showGlow
    };
  } catch (e) {
    console.warn('[ThemeManager] Failed to read stored theme:', e);
    return DEFAULT_THEME_SETTINGS;
  }
}

export function applyTheme(settings: ThemeSettings): void {
  if (typeof document === 'undefined') return;

  const preset = THEME_PRESETS[settings.presetId] || THEME_PRESETS.cyberpunk;
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

export function saveThemeSettings(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings));
    applyTheme(settings);
    window.dispatchEvent(new CustomEvent('motion:theme-change', { detail: { settings } }));
  } catch (e) {
    console.error('[ThemeManager] Failed to save theme:', e);
  }
}
