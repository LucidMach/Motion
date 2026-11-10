import { getThemeSettings, saveThemeSettings, getCurrentLocalMinutes } from '../settings/themeManager';
import { calculateSolarState } from './mapThemeCustomizer';
import type { ThemeChangeEventDetail } from '../../types/events';

function formatMinutesToTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = Math.floor(m % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function solarEmoji(isNight: boolean, lightPreset: string): string {
  if (isNight) return '🌙';
  if (lightPreset === 'dawn') return '🌅';
  if (lightPreset === 'dusk') return '🌆';
  return '☀️';
}

// Daylight time-of-day control, added into MotionNavigationControl's dock
// alongside zoom/perspective: a single glass button that expands into a
// one-line popover (time badge, Live toggle, slider). Live sync reads as a
// border glow on the trigger button rather than a dot badge.
export class DaylightControlButton {
  private wrap: HTMLDivElement;
  private button: HTMLButtonElement;
  private popover: HTMLDivElement;
  private slider: HTMLInputElement;
  private timeLabel: HTMLSpanElement;
  private emojiLabel: HTMLSpanElement;
  private popoverEmojiLabel: HTMLSpanElement;
  private liveBtn: HTMLButtonElement;

  private timeMinutes: number;
  private isLive: boolean;
  private isDragging = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;

  constructor(container: HTMLElement) {
    const initial = getThemeSettings();
    this.isLive = initial.syncWithRealTime !== false;
    this.timeMinutes = this.isLive
      ? getCurrentLocalMinutes()
      : typeof initial.timeMinutes === 'number'
      ? initial.timeMinutes
      : getCurrentLocalMinutes();

    this.wrap = document.createElement('div');
    this.wrap.className = 'motion-daylight-wrap';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'motion-ctrl-btn motion-daylight-btn';
    this.button.setAttribute('aria-haspopup', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.onclick = (e) => {
      e.stopPropagation();
      this.togglePopover();
    };

    this.emojiLabel = document.createElement('span');
    this.emojiLabel.className = 'motion-ctrl-icon motion-daylight-emoji';
    this.button.appendChild(this.emojiLabel);

    this.popover = document.createElement('div');
    this.popover.className = 'motion-daylight-popover';

    const timeBadge = document.createElement('div');
    timeBadge.className = 'motion-daylight-time';
    this.popoverEmojiLabel = document.createElement('span');
    this.timeLabel = document.createElement('span');
    timeBadge.appendChild(this.popoverEmojiLabel);
    timeBadge.appendChild(this.timeLabel);

    this.liveBtn = document.createElement('button');
    this.liveBtn.type = 'button';
    this.liveBtn.className = 'motion-daylight-live-btn';
    const liveDot = document.createElement('span');
    liveDot.className = 'motion-daylight-live-dot';
    const liveText = document.createElement('span');
    liveText.textContent = 'Live';
    this.liveBtn.appendChild(liveDot);
    this.liveBtn.appendChild(liveText);
    this.liveBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleLive();
    };

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'motion-daylight-slider-wrap';
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '1440';
    this.slider.step = '2';
    this.slider.className = 'diurnal-slider';
    this.slider.setAttribute('aria-label', 'Solar time controller');
    this.slider.setAttribute('aria-valuemin', '0');
    this.slider.setAttribute('aria-valuemax', '1440');
    this.slider.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.isDragging = true;
      this.setLive(false, false);
    });
    this.slider.addEventListener('pointerup', () => this.onSliderCommit());
    this.slider.addEventListener('touchend', () => this.onSliderCommit());
    this.slider.addEventListener('mouseup', () => this.onSliderCommit());
    this.slider.addEventListener('input', (e) => {
      const minutes = parseInt((e.target as HTMLInputElement).value, 10);
      this.timeMinutes = minutes;
      this.isLive = false;
      this.renderTimeLabels();
      this.renderLiveState();
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.dispatchUpdate(false, false);
          this.rafId = null;
        });
      }
    });
    sliderWrap.appendChild(this.slider);

    this.popover.appendChild(timeBadge);
    this.popover.appendChild(this.liveBtn);
    this.popover.appendChild(sliderWrap);

    this.wrap.appendChild(this.button);
    this.wrap.appendChild(this.popover);
    container.appendChild(this.wrap);

    this.renderAll();
    if (this.isLive) {
      this.dispatchUpdate(false, true);
    }

    window.addEventListener('motion:theme-change', this.onThemeChange);
    document.addEventListener('pointerdown', this.onDocumentPointerDown);
    document.addEventListener('keydown', this.onDocumentKeyDown);

    this.tickInterval = setInterval(() => {
      if (this.isLive && !this.isDragging) {
        const current = getCurrentLocalMinutes();
        if (current !== this.timeMinutes) {
          this.timeMinutes = current;
          this.renderTimeLabels();
          this.dispatchUpdate(false, true);
        }
      }
    }, 10000);
  }

  private onSliderCommit = (): void => {
    this.isDragging = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.dispatchUpdate(true, false);
  };

  private onThemeChange = (e: Event): void => {
    if (this.isDragging) return;
    const detail = (e as CustomEvent<ThemeChangeEventDetail>).detail;
    let changed = false;
    if (typeof detail?.settings?.timeMinutes === 'number') {
      this.timeMinutes = detail.settings.timeMinutes;
      changed = true;
    }
    if (typeof detail?.settings?.syncWithRealTime === 'boolean') {
      this.isLive = detail.settings.syncWithRealTime;
      changed = true;
    }
    if (changed) {
      this.renderTimeLabels();
      this.renderLiveState();
    }
  };

  private onDocumentPointerDown = (e: PointerEvent): void => {
    if (!this.isOpen()) return;
    const target = e.target as Node;
    if (!this.wrap.contains(target)) {
      this.closePopover();
    }
  };

  private onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen()) this.closePopover();
  };

  private isOpen(): boolean {
    return this.popover.classList.contains('is-open');
  }

  private togglePopover(): void {
    if (this.isOpen()) this.closePopover();
    else this.openPopover();
  }

  private openPopover(): void {
    this.popover.classList.add('is-open');
    this.button.setAttribute('aria-expanded', 'true');
  }

  private closePopover(): void {
    this.popover.classList.remove('is-open');
    this.button.setAttribute('aria-expanded', 'false');
  }

  private setLive(isLive: boolean, persistImmediate: boolean): void {
    this.isLive = isLive;
    if (isLive) {
      this.timeMinutes = getCurrentLocalMinutes();
    }
    this.renderTimeLabels();
    this.renderLiveState();
    this.dispatchUpdate(persistImmediate, isLive);
  }

  private toggleLive(): void {
    this.setLive(!this.isLive, true);
  }

  private dispatchUpdate(persistImmediate: boolean, syncLive: boolean): void {
    const solar = calculateSolarState(this.timeMinutes);
    const current = getThemeSettings();
    saveThemeSettings(
      { ...current, timeMinutes: this.timeMinutes, lightPreset: solar.lightPreset, syncWithRealTime: syncLive },
      { persistImmediate }
    );
  }

  private renderTimeLabels(): void {
    const solar = calculateSolarState(this.timeMinutes);
    const emoji = solarEmoji(solar.isNight, solar.lightPreset);
    const formatted = formatMinutesToTime(this.timeMinutes);
    this.emojiLabel.textContent = emoji;
    this.popoverEmojiLabel.textContent = emoji;
    this.timeLabel.textContent = formatted;
    this.slider.value = String(this.timeMinutes);
    this.slider.setAttribute('aria-valuenow', String(this.timeMinutes));
    this.slider.setAttribute('aria-valuetext', `${formatted} (${solar.lightPreset})${this.isLive ? ' - Live Sync' : ''}`);
  }

  private renderLiveState(): void {
    this.button.classList.toggle('is-live', this.isLive);
    this.liveBtn.classList.toggle('is-live', this.isLive);
    this.liveBtn.title = this.isLive
      ? 'Live sync active. Click to unsync / pause.'
      : `Unsynced. Click to sync with local time (${formatMinutesToTime(getCurrentLocalMinutes())})`;
  }

  private renderAll(): void {
    this.renderTimeLabels();
    this.renderLiveState();
    this.button.title = 'Adjust daylight time';
    this.button.setAttribute('aria-label', 'Adjust daylight time');
  }

  destroy(): void {
    window.removeEventListener('motion:theme-change', this.onThemeChange);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown);
    document.removeEventListener('keydown', this.onDocumentKeyDown);
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.wrap.remove();
  }
}
