import mapboxgl from 'mapbox-gl';

// Owns the 3D/2D perspective flag and the two ways the camera moves:
// an explicit flyTo (recenter/first-fix) and the perspective ease-in/out.
export class CameraController {
  private is3DActive = true;

  constructor(private getMap: () => mapboxgl.Map | null) {}

  get is3D(): boolean {
    return this.is3DActive;
  }

  flyTo(coords: [number, number], zoom = 16.5, pitch = 60, customPadding?: mapboxgl.PaddingOptions): void {
    const map = this.getMap();
    if (!map) return;

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const explorerOpen =
      typeof document !== 'undefined' &&
      document.getElementById('transit-explorer-panel')?.classList.contains('translate-x-0');
    const vehiclePanelOpen =
      typeof document !== 'undefined' &&
      document.getElementById('vehicle-panel')?.classList.contains('translate-x-0');

    const padding: mapboxgl.PaddingOptions = customPadding || {
      top: 60,
      bottom: 100,
      left: isDesktop && explorerOpen ? 500 : 40,
      right: isDesktop && vehiclePanelOpen ? 320 : 40
    };

    map.flyTo({
      center: coords,
      zoom,
      pitch: this.is3DActive ? pitch : 0,
      bearing: map.getBearing(),
      padding,
      essential: true,
      duration: 2200,
      curve: 1.35
    });
  }

  toggle(): boolean {
    return this.setPerspective(!this.is3DActive);
  }

  setPerspective(enable3D: boolean): boolean {
    const map = this.getMap();
    if (!map) return enable3D;
    this.is3DActive = enable3D;
    map.easeTo({ pitch: enable3D ? 62 : 0, bearing: enable3D ? -20 : 0, duration: 1200 });
    window.dispatchEvent(new CustomEvent('motion:3d-state', { detail: { is3D: enable3D } }));
    return enable3D;
  }

  syncPitchState(): void {
    const map = this.getMap();
    if (!map) return;
    const is3D = map.getPitch() > 5;
    if (is3D !== this.is3DActive) {
      this.is3DActive = is3D;
      window.dispatchEvent(new CustomEvent('motion:3d-state', { detail: { is3D } }));
    }
  }
}
