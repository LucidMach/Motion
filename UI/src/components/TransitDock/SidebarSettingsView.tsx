import React, { useState, useEffect } from 'react';
import GestureSettingsTab from '../SettingsModal/GestureSettingsTab';
import TokenSettingsTab from '../SettingsModal/TokenSettingsTab';
import type { GestureSettings } from '../../types/settings';
import { DEFAULT_GESTURE_SETTINGS } from '../../types/settings';
import { getGestureSettings, saveGestureSettings } from '../../scripts/settings/gestureManager';

interface SidebarSettingsViewProps {
  onClose: () => void;
}

export default function SidebarSettingsView({ onClose }: SidebarSettingsViewProps) {
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>(DEFAULT_GESTURE_SETTINGS);

  useEffect(() => {
    setGestureSettings(getGestureSettings());
  }, []);

  const handleGestureChange = (updated: Partial<GestureSettings>) => {
    const next = { ...gestureSettings, ...updated };
    setGestureSettings(next);
    saveGestureSettings(next);
  };

  const handleResetGestures = () => {
    setGestureSettings(DEFAULT_GESTURE_SETTINGS);
    saveGestureSettings(DEFAULT_GESTURE_SETTINGS);
  };

  const handleTokenUpdated = (newToken: string) => {
    window.dispatchEvent(new CustomEvent('motion:cmd:update-token', { detail: { token: newToken } }));
  };

  return (
    <div className="flex flex-1 flex-col min-w-0 bg-transparent overflow-hidden">
      {/* Content Header */}
      <div className="flex items-center justify-between border-b border-subtle/60 px-5 py-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan shadow-sm">
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-display text-sm font-bold text-primary tracking-tight">
              Studio Settings
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] font-semibold tracking-wider text-accent-cyan uppercase">
                Motion Controls
              </span>
              <span className="text-secondary/40">•</span>
              <span className="text-[10px] text-secondary">Gestures & Engine Token</span>
            </div>
          </div>
        </div>

        <button
          id="transit-explorer-close-btn"
          onClick={onClose}
          aria-label="Close Settings"
          title="Close (Esc)"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-subtle bg-surface/60 text-secondary transition-all hover:bg-surface-hover hover:text-primary active:scale-95"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Unified Settings Scroll Container */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Section 1: Gesture Controls */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              Gesture & Navigation Controls
            </span>
            <span className="text-[10px] text-secondary">3D Camera & Mouse Drag</span>
          </div>
          <GestureSettingsTab settings={gestureSettings} onChange={handleGestureChange} />
        </div>

        <div className="h-px bg-subtle/60" />

        {/* Section 2: Mapbox Public Token */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
              Mapbox Access Token
            </span>
            <span className="text-[10px] text-secondary">3D Terrain & Basemap</span>
          </div>
          <TokenSettingsTab onTokenUpdated={handleTokenUpdated} />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-subtle bg-surface/40 px-5 py-3 text-[11px] text-secondary">
        <button
          type="button"
          onClick={handleResetGestures}
          className="text-[0.74rem] font-semibold text-secondary transition-colors hover:text-accent-cyan hover:underline"
        >
          Reset gestures to defaults
        </button>

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-hover px-4 py-1.5 font-sans text-[0.78rem] font-semibold text-primary transition-all hover:border-glow hover:text-white active:scale-95"
        >
          Done
        </button>
      </div>
    </div>
  );
}
