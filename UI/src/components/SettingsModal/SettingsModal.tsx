import { useEffect, useState } from 'react';
import SettingsHeader from './SettingsHeader';
import ThemeSettingsTab from './ThemeSettingsTab';
import GestureSettingsTab from './GestureSettingsTab';
import TokenSettingsTab from './TokenSettingsTab';
import type { GestureSettings, ThemeSettings } from '../../types/settings';
import { DEFAULT_GESTURE_SETTINGS, DEFAULT_THEME_SETTINGS } from '../../types/settings';
import { getThemeSettings, saveThemeSettings } from '../../scripts/settings/themeManager';
import { getGestureSettings, saveGestureSettings } from '../../scripts/settings/gestureManager';

export default function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'theme' | 'gestures' | 'token'>('theme');
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
  const [gestureSettings, setGestureSettings] = useState<GestureSettings>(DEFAULT_GESTURE_SETTINGS);

  useEffect(() => {
    // Initialize settings from storage on mount
    setThemeSettings(getThemeSettings());
    setGestureSettings(getGestureSettings());

    const openModal = (e?: Event) => {
      const tab = (e as CustomEvent<{ tab?: 'theme' | 'gestures' | 'token' }> | undefined)?.detail?.tab;
      if (tab) setActiveTab(tab);
      setThemeSettings(getThemeSettings());
      setGestureSettings(getGestureSettings());
      setIsOpen(true);
    };

    window.addEventListener('motion:cmd:open-settings-modal', openModal);
    return () => {
      window.removeEventListener('motion:cmd:open-settings-modal', openModal);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleThemeChange = (updated: Partial<ThemeSettings>) => {
    const next = { ...themeSettings, ...updated };
    setThemeSettings(next);
    saveThemeSettings(next);
  };

  const handleGestureChange = (updated: Partial<GestureSettings>) => {
    const next = { ...gestureSettings, ...updated };
    setGestureSettings(next);
    saveGestureSettings(next);
  };

  const handleResetDefaults = () => {
    if (activeTab === 'theme') {
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      saveThemeSettings(DEFAULT_THEME_SETTINGS);
    } else if (activeTab === 'gestures') {
      setGestureSettings(DEFAULT_GESTURE_SETTINGS);
      saveGestureSettings(DEFAULT_GESTURE_SETTINGS);
    }
  };

  const handleTokenUpdated = (newToken: string) => {
    window.dispatchEvent(new CustomEvent('motion:cmd:update-token', { detail: { token: newToken } }));
  };

  return (
    <div
      role="dialog"
      aria-hidden={!isOpen}
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
      className={`fixed inset-0 z-100 flex items-center justify-center bg-[rgba(3,7,18,0.78)] p-4 backdrop-blur-md transition-all duration-250 ${
        isOpen ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'
      }`}
    >
      <div className="flex max-h-[90vh] w-[92%] max-w-160 animate-modal-in flex-col gap-5 overflow-hidden rounded-4xl border border-glow bg-surface-elevated p-7 shadow-[0_24px_60px_rgba(0,0,0,0.7),0_0_35px_rgba(56,189,248,0.18)] max-[768px]:rounded-2xl max-[768px]:p-5">
        <SettingsHeader activeTab={activeTab} onTabChange={setActiveTab} onClose={() => setIsOpen(false)} />

        {/* Tab Content Container */}
        <div className="overflow-y-auto pr-1">
          {activeTab === 'theme' && (
            <ThemeSettingsTab settings={themeSettings} onChange={handleThemeChange} />
          )}

          {activeTab === 'gestures' && (
            <GestureSettingsTab settings={gestureSettings} onChange={handleGestureChange} />
          )}

          {activeTab === 'token' && (
            <TokenSettingsTab onTokenUpdated={handleTokenUpdated} />
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-subtle pt-4">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-[0.76rem] font-semibold text-secondary transition-colors hover:text-primary hover:underline"
          >
            Reset tab to defaults
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 rounded-full border border-subtle bg-surface-hover px-6 py-2.5 font-sans text-[0.82rem] font-semibold text-primary transition-all hover:border-glow hover:text-white active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
