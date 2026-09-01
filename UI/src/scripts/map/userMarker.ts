import mapboxgl from 'mapbox-gl';

function popupHtml(latitude: number, longitude: number, accuracy: number, withCoords: boolean): string {
  const coordsLine = withCoords
    ? `<div class="my-0.75 font-mono text-[11px] text-primary">${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°</div>`
    : '';
  return `
    <div class="font-sans text-[13px] leading-[1.4]">
      <strong class="mb-0.5 block text-accent-cyan">📍 Current Location</strong>
      ${coordsLine}
      <span class="text-[11px] text-secondary">GPS Accuracy: ±${accuracy}m</span>
    </div>
  `;
}

// Owns the pulsing 3D marker + popup that tracks the user's GPS position on the map.
export class UserMarkerManager {
  private marker: mapboxgl.Marker | null = null;
  private element: HTMLElement | null = null;

  constructor(private map: mapboxgl.Map, private onClick: () => void) {}

  render(coords: [number, number], heading: number | null, accuracy: number): void {
    if (!this.marker) {
      this.createMarker(coords, accuracy);
    } else {
      this.marker.setLngLat(coords);
      this.marker.getPopup()?.setHTML(popupHtml(coords[1], coords[0], accuracy, true));
    }
    this.updateHeading(heading);
  }

  private createMarker(coords: [number, number], accuracy: number): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'user-location-marker-wrapper';
    wrapper.title = 'Your Current Position';
    wrapper.innerHTML = `
      <div class="user-marker-radar"></div>
      <div class="user-marker-radar-secondary"></div>
      <div class="user-marker-core"></div>
      <div class="user-marker-heading"></div>
    `;
    this.element = wrapper;

    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false, className: 'user-loc-popup' }).setHTML(
      popupHtml(coords[1], coords[0], accuracy, false)
    );

    this.marker = new mapboxgl.Marker({
      element: wrapper,
      anchor: 'center',
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })
      .setLngLat(coords)
      .setPopup(popup)
      .addTo(this.map);

    wrapper.addEventListener('click', () => this.onClick());
  }

  private updateHeading(heading: number | null): void {
    const headingEl = this.element?.querySelector<HTMLElement>('.user-marker-heading');
    if (!headingEl) return;
    if (heading !== null && heading !== undefined) {
      headingEl.style.display = 'block';
      headingEl.style.transform = `rotate(${heading}deg)`;
    } else {
      headingEl.style.display = 'none';
    }
  }

  remove(): void {
    this.marker?.remove();
    this.marker = null;
    this.element = null;
  }
}
