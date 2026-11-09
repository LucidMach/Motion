// Shared sizing info for the mobile bottom-sheet panels (Transit Explorer /
// Vehicle Inspector). Kept in sync with their `h-[61.8dvh]` Tailwind class so
// that camera flyTo/fitBounds padding knows how much of the screen they cover
// and can pan content into the remaining visible space instead of under it.
export const MOBILE_BREAKPOINT_PX = 768;
export const MOBILE_SHEET_RATIO = 0.618;

export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

function hasOpenClass(elementId: string): boolean {
  return (
    typeof document !== 'undefined' &&
    Boolean(document.getElementById(elementId)?.classList.contains('translate-x-0'))
  );
}

export function isExplorerPanelOpen(): boolean {
  return hasOpenClass('transit-explorer-panel');
}

export function isVehiclePanelOpen(): boolean {
  return hasOpenClass('vehicle-panel');
}

// Height (px) the open mobile bottom-sheet panel currently occupies, or 0 if
// none is open, or we're on a desktop-width viewport where panels dock to
// the side instead of sliding up from the bottom.
export function mobileSheetHeightPx(): number {
  if (typeof window === 'undefined' || !isMobileViewport()) return 0;
  if (!isExplorerPanelOpen() && !isVehiclePanelOpen()) return 0;
  return Math.round(window.innerHeight * MOBILE_SHEET_RATIO);
}
