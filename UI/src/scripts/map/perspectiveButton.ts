// Renders the 2D/3D toggle button's icon + label markup for MotionNavigationControl.

const BASE_CLASSES =
  'motion-ctrl-btn flex h-11 w-full flex-col items-center justify-center gap-px py-0.5 text-secondary transition-colors duration-200 hover:bg-surface-hover hover:text-primary active:scale-[0.92] active:bg-accent-cyan/15';

export function perspectiveButtonClasses(is3D: boolean): string {
  return is3D ? `${BASE_CLASSES} bg-accent-cyan/[0.08] text-accent-cyan` : BASE_CLASSES;
}

export function perspectiveButtonHtml(is3D: boolean): string {
  const iconClasses = `h-5 w-5 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.15] ${
    is3D ? '[filter:drop-shadow(0_0_6px_rgba(56,189,248,0.8))]' : ''
  }`;
  const labelClasses = `font-display text-[0.58rem] font-extrabold leading-none tracking-[0.06em] select-none pointer-events-none ${
    is3D ? 'text-accent-cyan' : 'text-muted'
  }`;

  const icon = is3D
    ? `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
       <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
       <line x1="12" y1="22.08" x2="12" y2="12"></line>`
    : `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"></rect>`;

  return `
    <svg class="${iconClasses}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${icon}
    </svg>
    <span class="${labelClasses}">${is3D ? '3D' : '2D'}</span>
  `;
}
