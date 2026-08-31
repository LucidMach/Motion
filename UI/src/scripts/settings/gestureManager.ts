import type { GestureSettings, MouseDragAction } from '../../types/settings';
import { DEFAULT_GESTURE_SETTINGS } from '../../types/settings';

export const GESTURE_STORAGE_KEY = 'motion_gesture_settings';

export interface DragActionOption {
  id: MouseDragAction;
  label: string;
  shortLabel: string;
  badge?: string;
}

export const DRAG_ACTION_OPTIONS: DragActionOption[] = [
  {
    id: 'shiftLeft',
    label: 'Shift + Left Click Drag',
    shortLabel: '⇧ Shift + Left',
    badge: 'Standard'
  },
  {
    id: 'right',
    label: 'Right Click Drag',
    shortLabel: 'Right Click',
    badge: 'Direct'
  },
  {
    id: 'left',
    label: 'Left Click Drag',
    shortLabel: 'Left Click',
    badge: 'Direct'
  },
  {
    id: 'shiftRight',
    label: 'Shift + Right Click Drag',
    shortLabel: '⇧ Shift + Right',
    badge: 'Alternative'
  }
];

export function getGestureSettings(): GestureSettings {
  if (typeof window === 'undefined') return DEFAULT_GESTURE_SETTINGS;
  try {
    const raw = localStorage.getItem(GESTURE_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(GESTURE_STORAGE_KEY, JSON.stringify(DEFAULT_GESTURE_SETTINGS));
      return DEFAULT_GESTURE_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    
    // Migration fallback from older orbitModifier field if present
    let orbitAction: MouseDragAction = DEFAULT_GESTURE_SETTINGS.orbitAction;
    let panAction: MouseDragAction = DEFAULT_GESTURE_SETTINGS.panAction;

    if (parsed.orbitAction) {
      orbitAction = parsed.orbitAction;
    } else if (parsed.orbitModifier === 'rightOnly') {
      orbitAction = 'right';
    } else if (parsed.orbitModifier === 'none') {
      orbitAction = 'left';
      panAction = 'shiftLeft';
    }

    if (parsed.panAction) {
      panAction = parsed.panAction;
    }

    return {
      orbitAction,
      panAction,
      orbitSensitivity: typeof parsed.orbitSensitivity === 'number' ? parsed.orbitSensitivity : DEFAULT_GESTURE_SETTINGS.orbitSensitivity,
      invertPitch: typeof parsed.invertPitch === 'boolean' ? parsed.invertPitch : DEFAULT_GESTURE_SETTINGS.invertPitch,
      enableScrollZoom: typeof parsed.enableScrollZoom === 'boolean' ? parsed.enableScrollZoom : DEFAULT_GESTURE_SETTINGS.enableScrollZoom,
      enableDoubleClickZoom: typeof parsed.enableDoubleClickZoom === 'boolean' ? parsed.enableDoubleClickZoom : DEFAULT_GESTURE_SETTINGS.enableDoubleClickZoom,
      enableKeyboard: typeof parsed.enableKeyboard === 'boolean' ? parsed.enableKeyboard : DEFAULT_GESTURE_SETTINGS.enableKeyboard
    };
  } catch (e) {
    console.warn('[GestureManager] Failed to read stored gestures:', e);
    return DEFAULT_GESTURE_SETTINGS;
  }
}

export function saveGestureSettings(settings: GestureSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GESTURE_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('motion:gesture-change', { detail: { settings } }));
  } catch (e) {
    console.error('[GestureManager] Failed to save gesture settings:', e);
  }
}
