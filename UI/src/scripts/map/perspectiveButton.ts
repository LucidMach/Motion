// Renders the 2D/3D toggle button's icon + label markup for MotionNavigationControl.

export function perspectiveButtonClasses(is3D: boolean): string {
  return `motion-ctrl-btn motion-camera-toggle ${is3D ? 'is-3d' : 'is-2d'}`;
}

export function perspectiveButtonHtml(is3D: boolean): string {
  const icon = is3D
    ? `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
       <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
       <line x1="12" y1="22.08" x2="12" y2="12"></line>`
    : `<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"></rect>`;

  return `
    <svg class="motion-ctrl-icon cam-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="${is3D ? '2' : '2.2'}" stroke-linecap="round" stroke-linejoin="round">
      ${icon}
    </svg>
    <span class="cam-btn-label">${is3D ? '3D' : '2D'}</span>
  `;
}

