import mapboxgl from 'mapbox-gl';
import type { PerspectiveEventDetail } from '../../types/events';
import { perspectiveButtonClasses, perspectiveButtonHtml } from './perspectiveButton';

const ZOOM_BTN_CLASSES =
  'motion-ctrl-btn group flex h-[38px] w-full items-center justify-center border-b border-subtle text-secondary transition-colors duration-200 hover:bg-surface-hover hover:text-primary active:scale-[0.92] active:bg-accent-cyan/15 [&:last-child]:border-b-0';

const ICON_CLASSES =
  'h-[18px] w-[18px] pointer-events-none transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.15]';

// Bottom-right dock: zoom in/out + the 2D/3D perspective toggle, in one glass control group.
export class MotionNavigationControl implements mapboxgl.IControl {
  private map?: mapboxgl.Map;
  private container?: HTMLElement;
  private btnPerspective?: HTMLButtonElement;
  private is3D = true;

  onAdd(map: mapboxgl.Map): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className =
      'mapboxgl-ctrl mapboxgl-ctrl-group flex w-9 flex-col overflow-hidden rounded-md border border-subtle bg-surface-elevated shadow-glass backdrop-blur-lg';

    this.container.appendChild(this.buildZoomButton('Zoom In', 'Zoom In', () => this.map?.zoomIn({ duration: 300 }), true));
    this.container.appendChild(this.buildZoomButton('Zoom Out', 'Zoom Out', () => this.map?.zoomOut({ duration: 300 }), false));

    this.btnPerspective = document.createElement('button');
    this.btnPerspective.type = 'button';
    this.btnPerspective.className = perspectiveButtonClasses(this.is3D);
    this.renderPerspectiveButton();
    this.btnPerspective.onclick = (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('motion:cmd:toggle-3d'));
    };
    this.container.appendChild(this.btnPerspective);

    window.addEventListener('motion:3d-state', this.on3DStateChange);
    return this.container;
  }

  private buildZoomButton(title: string, ariaLabel: string, onClick: () => void, isPlus: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', ariaLabel);
    btn.className = ZOOM_BTN_CLASSES;
    btn.innerHTML = `
      <svg class="${ICON_CLASSES}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        ${isPlus ? '<line x1="12" y1="5" x2="12" y2="19"></line>' : ''}
      </svg>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  private on3DStateChange = (e: Event) => {
    const is3D = (e as CustomEvent<PerspectiveEventDetail>).detail?.is3D;
    if (typeof is3D === 'boolean') {
      this.is3D = is3D;
      this.renderPerspectiveButton();
    }
  };

  private renderPerspectiveButton(): void {
    if (!this.btnPerspective) return;
    this.btnPerspective.className = `group ${perspectiveButtonClasses(this.is3D)}`;
    this.btnPerspective.title = this.is3D ? 'Switch to 2D Planar View (Currently 3D)' : 'Switch to 3D Oblique Perspective (Currently 2D)';
    this.btnPerspective.setAttribute('aria-label', this.is3D ? 'Switch to 2D Planar View' : 'Switch to 3D Oblique Perspective');
    this.btnPerspective.innerHTML = perspectiveButtonHtml(this.is3D);
  }

  onRemove(): void {
    window.removeEventListener('motion:3d-state', this.on3DStateChange);
    this.container?.parentNode?.removeChild(this.container);
    this.map = undefined;
  }
}
