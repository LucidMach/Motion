export type ThemePresetId = 'cyberpunk' | 'spring' | 'summer' | 'autumn' | 'winter' | 'obsidian';
export type MapLightPreset = 'dawn' | 'day' | 'dusk' | 'night';
export type MapStyleId = 'standard' | 'satellite' | 'dark' | 'light' | 'navigation' | 'outdoors';
export type OrbitModifier = 'shift' | 'ctrl' | 'alt' | 'none' | 'rightOnly';

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  seasonBadge?: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  deepBg: string;
  surfaceBg: string;
  surfaceElevated: string;
  surfaceHover: string;
  glowColor: string;
  accentCyan: string;
  accentIndigo: string;
  brandGradient: string;
  subtleBorder?: string;
  defaultLightPreset: MapLightPreset;
}

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
  tagline: string;
  url: string;
  badge: string;
  is3DSupported: boolean;
}

export interface ThemeSettings {
  presetId: ThemePresetId;
  lightPreset: MapLightPreset;
  mapStyle: MapStyleId;
  glassIntensity: 'subtle' | 'standard' | 'high';
  showGlow: boolean;
}

export type MouseDragAction = 'shiftLeft' | 'right' | 'left' | 'shiftRight';

export interface GestureSettings {
  orbitAction: MouseDragAction;
  panAction: MouseDragAction;
  orbitSensitivity: number; // 0.5 to 2.0
  invertPitch: boolean;
  enableScrollZoom: boolean;
  enableDoubleClickZoom: boolean;
  enableKeyboard: boolean;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  presetId: 'cyberpunk',
  lightPreset: 'day',
  mapStyle: 'standard',
  glassIntensity: 'standard',
  showGlow: true
};

export const DEFAULT_GESTURE_SETTINGS: GestureSettings = {
  orbitAction: 'shiftLeft',
  panAction: 'left',
  orbitSensitivity: 1.0,
  invertPitch: false,
  enableScrollZoom: true,
  enableDoubleClickZoom: true,
  enableKeyboard: true
};
