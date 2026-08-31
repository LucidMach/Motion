import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export interface LocationTelemetry {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  source: 'gps' | 'preset' | 'default';
  locationName?: string;
}

export interface PresetLocation {
  name: string;
  coords: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export const TRANSIT_HUBS: Record<string, PresetLocation> = {
  flinders: {
    name: 'Flinders St Station',
    coords: [144.9671, -37.8180],
    zoom: 16.5,
    pitch: 62,
    bearing: -24,
    description: 'Melbourne Metropolitan Rail Core'
  },
  southernCross: {
    name: 'Southern Cross Station',
    coords: [144.9525, -37.8185],
    zoom: 16.2,
    pitch: 60,
    bearing: 15,
    description: 'V/Line Regional & SkyBus Terminal'
  },
  melbCentral: {
    name: 'Melbourne Central',
    coords: [144.9625, -37.8100],
    zoom: 16.5,
    pitch: 64,
    bearing: -45,
    description: 'City Loop Underground Interchange'
  },
  boxHill: {
    name: 'Box Hill Interchange',
    coords: [145.1228, -37.8193],
    zoom: 16.0,
    pitch: 55,
    bearing: 10,
    description: 'Eastern Suburbs Multi-Modal Hub'
  },
  monash: {
    name: 'Clayton / Monash',
    coords: [145.1332, -37.9150],
    zoom: 15.8,
    pitch: 50,
    bearing: -15,
    description: 'South-East Innovation & Bus Interchange'
  }
};

export interface RegionZone {
  name: string;
  subRegion?: string;
  bounds?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  center?: [number, number]; // [lng, lat]
  radiusKm?: number;
}

export const VICTORIAN_REGIONS: RegionZone[] = [
  {
    name: 'Flinders St • Melbourne CBD',
    bounds: [144.960, -37.821, 144.975, -37.815],
    center: [144.9671, -37.8180],
    radiusKm: 0.6
  },
  {
    name: 'Melbourne Central • City Loop',
    bounds: [144.957, -37.814, 144.969, -37.807],
    center: [144.9625, -37.8100],
    radiusKm: 0.6
  },
  {
    name: 'Southern Cross • Regional Terminal',
    bounds: [144.947, -37.822, 144.957, -37.814],
    center: [144.9525, -37.8185],
    radiusKm: 0.6
  },
  {
    name: 'Melbourne CBD • Victoria',
    bounds: [144.946, -37.825, 144.978, -37.804],
    center: [144.9631, -37.8136],
    radiusKm: 1.5
  },
  {
    name: 'Southbank • Arts Precinct',
    bounds: [144.955, -37.834, 144.978, -37.820],
    center: [144.967, -37.826],
    radiusKm: 1.0
  },
  {
    name: 'Docklands • Victoria Harbour',
    bounds: [144.930, -37.826, 144.950, -37.809],
    center: [144.941, -37.817],
    radiusKm: 1.2
  },
  {
    name: 'Carlton • University Precinct',
    bounds: [144.954, -37.806, 144.976, -37.791],
    center: [144.963, -37.799],
    radiusKm: 1.1
  },
  {
    name: 'Parkville • Biomedical & Health Hub',
    bounds: [144.938, -37.802, 144.962, -37.778],
    center: [144.950, -37.790],
    radiusKm: 1.4
  },
  {
    name: 'East Melbourne • Olympic & MCG',
    bounds: [144.976, -37.826, 144.993, -37.810],
    center: [144.983, -37.819],
    radiusKm: 1.0
  },
  {
    name: 'Richmond • Transit Interchange',
    bounds: [144.984, -37.836, 145.018, -37.814],
    center: [144.998, -37.824],
    radiusKm: 1.5
  },
  {
    name: 'South Yarra • Chapel Street',
    bounds: [144.979, -37.856, 145.016, -37.832],
    center: [144.993, -37.842],
    radiusKm: 1.4
  },
  {
    name: 'St Kilda • Port Phillip Foreshore',
    bounds: [144.963, -37.878, 145.002, -37.854],
    center: [144.979, -37.866],
    radiusKm: 1.5
  },
  {
    name: 'Fitzroy & Collingwood • Inner North',
    bounds: [144.973, -37.810, 145.002, -37.791],
    center: [144.985, -37.801],
    radiusKm: 1.2
  },
  {
    name: 'Footscray • Western Transit Hub',
    bounds: [144.882, -37.813, 144.926, -37.785],
    center: [144.900, -37.801],
    radiusKm: 1.8
  },
  {
    name: 'North Melbourne • Arden Corridor',
    bounds: [144.923, -37.806, 144.952, -37.783],
    center: [144.938, -37.795],
    radiusKm: 1.3
  },
  {
    name: 'Box Hill • Eastern Transit Hub',
    bounds: [145.108, -37.832, 145.142, -37.808],
    center: [145.1228, -37.8193],
    radiusKm: 1.6
  },
  {
    name: 'Clayton • Monash Innovation Hub',
    bounds: [145.114, -37.932, 145.158, -37.902],
    center: [145.1332, -37.9150],
    radiusKm: 1.8
  },
  {
    name: 'Ringwood • Maroondah Interchange',
    bounds: [145.210, -37.828, 145.252, -37.802],
    center: [145.230, -37.815],
    radiusKm: 1.8
  },
  {
    name: 'Dandenong • South-East Transit Hub',
    bounds: [145.195, -37.998, 145.242, -37.968],
    center: [145.215, -37.985],
    radiusKm: 2.0
  },
  {
    name: 'Frankston • Mornington Gateway',
    bounds: [145.105, -38.162, 145.152, -38.125],
    center: [145.124, -38.143],
    radiusKm: 2.2
  },
  {
    name: 'Geelong • Regional Transit Corridor',
    bounds: [144.330, -38.175, 144.390, -38.125],
    center: [144.358, -38.148],
    radiusKm: 3.5
  },
  {
    name: 'Ballarat • Goldfields Regional Hub',
    bounds: [143.825, -37.585, 143.895, -37.535],
    center: [143.858, -37.561],
    radiusKm: 3.5
  },
  {
    name: 'Bendigo • Loddon Campaspe Hub',
    bounds: [144.245, -37.785, 144.315, -36.735],
    center: [144.278, -36.758],
    radiusKm: 3.5
  },
  {
    name: 'Melbourne Airport • SkyBus Terminal',
    bounds: [144.825, -37.690, 144.875, -37.650],
    center: [144.843, -37.671],
    radiusKm: 2.2
  }
];

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function resolveRegionInFocus(lng: number, lat: number, zoom: number): string {
  // If zoomed out significantly:
  if (zoom < 9.0) {
    if (lat >= -39.2 && lat <= -34.0 && lng >= 140.9 && lng <= 150.0) {
      return 'Victoria • Regional Transit Network';
    }
    return 'Victorian Transit • 3D Navigator';
  }

  if (zoom < 11.8) {
    // Greater Melbourne Bounding Box
    if (lat >= -38.3 && lat <= -37.5 && lng >= 144.6 && lng <= 145.5) {
      return 'Greater Melbourne • Transit Network';
    }
    if (lat >= -38.25 && lat <= -38.05 && lng >= 144.25 && lng <= 144.55) {
      return 'Geelong & Bellarine • Regional Network';
    }
    if (lat >= -37.7 && lat <= -37.4 && lng >= 143.7 && lng <= 144.0) {
      return 'Ballarat & Goldfields • Regional Network';
    }
    if (lat >= -36.9 && lat <= -36.6 && lng >= 144.15 && lng <= 144.45) {
      return 'Bendigo & Loddon • Regional Network';
    }
    return 'Victoria • Multi-Modal Transit';
  }

  // 1. Check exact bounding box matches (higher precision)
  for (const region of VICTORIAN_REGIONS) {
    if (region.bounds) {
      const [minLng, minLat, maxLng, maxLat] = region.bounds;
      if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
        return region.name;
      }
    }
  }

  // 2. Nearest centroid match within threshold radius
  let nearestRegion: RegionZone | null = null;
  let minDistance = Infinity;

  for (const region of VICTORIAN_REGIONS) {
    if (region.center) {
      const dist = calculateDistanceKm(lat, lng, region.center[1], region.center[0]);
      const maxAllowed = region.radiusKm || 2.5;
      if (dist <= maxAllowed && dist < minDistance) {
        minDistance = dist;
        nearestRegion = region;
      }
    }
  }

  if (nearestRegion) {
    return nearestRegion.name;
  }

  // Fallback within Melbourne Metro
  if (lat >= -38.05 && lat <= -37.65 && lng >= 144.80 && lng <= 145.25) {
    return 'Melbourne Metropolitan Transit Area';
  }

  return 'Victorian Transit Network';
}

export class MotionMapController {
  private map: mapboxgl.Map | null = null;
  private userMarker: mapboxgl.Marker | null = null;
  private markerElement: HTMLElement | null = null;
  private watchId: number | null = null;
  private lastLocation: LocationTelemetry | null = null;
  private is3DActive: boolean = true;
  private currentLightPreset: string = 'day';
  private token: string = '';
  private currentRegion: string = '';
  private regionDebounceTimer: any = null;

  constructor() {}

  public init(containerId: string, initialToken?: string): void {
    // 1. Resolve Mapbox Token
    this.token = initialToken ||
                 localStorage.getItem('motion_mapbox_token') ||
                 (typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_MAPBOX_TOKEN) ||
                 '';

    if (!this.token || this.token.includes('replace_me')) {
      console.warn('[MotionMap] No valid Mapbox token provided. Prompting setup.');
      this.dispatchStatus({ state: 'needs_token', message: 'Mapbox Access Token Required' });
      return;
    }

    mapboxgl.accessToken = this.token;

    try {
      console.log('[MotionMap] Initializing Mapbox GL JS 3D map...');
      
      // 2. Initialize Mapbox 3D Map
      this.map = new mapboxgl.Map({
        container: containerId,
        style: 'mapbox://styles/mapbox/standard',
        center: TRANSIT_HUBS.flinders.coords,
        zoom: 15.5,
        pitch: 58,
        bearing: -17.6,
        antialias: true,
        attributionControl: false
      });

      // Add unified navigation controls (Zoom in, Zoom out, and 2D/3D camera toggle button)
      this.map.addControl(new MotionNavigationControl(), 'bottom-right');

      this.map.on('load', () => {
        console.log('[MotionMap] Map load event fired.');
        this.map?.resize();
        this.configureDefault3DAtmosphere();
        this.updateRegionInFocus();
        this.dispatchStatus({ state: 'ready', message: 'GPS Accuracy: ±15m' });
      });

      this.map.on('style.load', () => {
        console.log('[MotionMap] Map style.load event fired.');
        this.map?.resize();
        this.configureDefault3DAtmosphere();
        this.updateRegionInFocus();
      });

      // Listen to map movement to dynamically compute region in focus
      this.map.on('move', () => {
        this.scheduleRegionUpdate();
      });

      this.map.on('moveend', () => {
        this.updateRegionInFocus();
      });

      // Periodic resize to prevent zero-dimension canvas issues
      setTimeout(() => this.map?.resize(), 250);
      setTimeout(() => this.map?.resize(), 1000);
      setTimeout(() => this.map?.resize(), 3000);

      this.map.on('error', (e: mapboxgl.ErrorEvent) => {
        console.warn('[MotionMap] Mapbox Notice/Error:', e);
        if (e.error?.message?.includes('Forbidden') || e.error?.message?.includes('Unauthorized') || (e.error as any)?.status === 401) {
          this.dispatchStatus({ state: 'needs_token', message: 'Invalid Mapbox Token' });
        }
      });

      // 3. Begin Geolocation Tracking
      this.startLocationTracking();

    } catch (err: any) {
      console.error('[MotionMap] Initialization error:', err);
      this.dispatchStatus({ state: 'error', message: err?.message || 'Failed to initialize map' });
    }
  }

  private scheduleRegionUpdate(): void {
    if (this.regionDebounceTimer) return;
    this.regionDebounceTimer = setTimeout(() => {
      this.regionDebounceTimer = null;
      this.updateRegionInFocus();
    }, 150);
  }

  public updateRegionInFocus(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const region = resolveRegionInFocus(center.lng, center.lat, zoom);
    if (region !== this.currentRegion) {
      this.currentRegion = region;
      this.dispatchRegion(region);
    }
  }

  public updateToken(newToken: string): void {
    const trimmed = newToken.trim();
    if (!trimmed) return;
    localStorage.setItem('motion_mapbox_token', trimmed);
    this.token = trimmed;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.init('map', trimmed);
  }

  private configureDefault3DAtmosphere(): void {
    if (!this.map) return;

    try {
      const mapAny = this.map as any;
      // Configure Standard Style lighting preset to default "day"
      if (typeof mapAny.setConfigProperty === 'function') {
        mapAny.setConfigProperty('basemap', 'lightPreset', this.currentLightPreset);
        mapAny.setConfigProperty('basemap', 'show3dObjects', true);
        mapAny.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
        mapAny.setConfigProperty('basemap', 'showTransitLabels', true);
      }
    } catch (e) {
      console.warn('[MotionMap] Style configuration note:', e);
    }
  }

  public startLocationTracking(): void {
    if (!navigator.geolocation) {
      this.dispatchStatus({ state: 'gps_unsupported', message: 'GPS Accuracy: Unavailable' });
      this.emitDefaultLocation();
      return;
    }

    this.dispatchStatus({ state: 'gps_acquiring', message: 'GPS Accuracy: Acquiring...' });

    // One-time quick fetch
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handlePositionUpdate(pos, true),
      (err) => this.handlePositionError(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    // Continuous watch
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePositionUpdate(pos, false),
      (err) => this.handlePositionError(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  private handlePositionUpdate(pos: GeolocationPosition, isFirstFix: boolean): void {
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
    const locRegion = resolveRegionInFocus(longitude, latitude, 16.0);
    const locationName = locRegion.includes(' • ') ? locRegion.split(' • ')[0] : (locRegion || 'My Location');

    this.lastLocation = {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      altitude: altitude ? Math.round(altitude) : null,
      altitudeAccuracy: altitudeAccuracy ? Math.round(altitudeAccuracy) : null,
      heading: heading !== null && !isNaN(heading) ? Math.round(heading) : null,
      speed: speed !== null && !isNaN(speed) ? Math.round(speed * 3.6) : null, // km/h
      timestamp: pos.timestamp,
      source: 'gps',
      locationName
    };

    this.renderUserMarker([longitude, latitude], this.lastLocation.heading);
    this.dispatchLocation(this.lastLocation);
    this.dispatchStatus({ state: 'gps_active', message: `GPS Accuracy: ±${this.lastLocation.accuracy}m` });

    // On first fix, smoothly fly into user's location
    if (isFirstFix && this.map) {
      this.flyToLocation([longitude, latitude], 16.5, 60);
    }
  }

  private handlePositionError(err: GeolocationPositionError): void {
    console.warn('[MotionMap] Geolocation Notice:', err.message);
    if (!this.lastLocation) {
      this.emitDefaultLocation();
    }
    const message = err.code === 1 ? 'GPS Accuracy: Permission Denied' : 'GPS Accuracy: Melbourne CBD (Approx)';
    this.dispatchStatus({ state: 'gps_fallback', message });
  }

  private emitDefaultLocation(): void {
    const defaultHub = TRANSIT_HUBS.flinders;
    this.lastLocation = {
      latitude: defaultHub.coords[1],
      longitude: defaultHub.coords[0],
      accuracy: 15,
      altitude: 35,
      altitudeAccuracy: 5,
      heading: 0,
      speed: 0,
      timestamp: Date.now(),
      source: 'default',
      locationName: 'Melbourne CBD'
    };
    this.renderUserMarker(defaultHub.coords, 0);
    this.dispatchLocation(this.lastLocation);
  }

  private renderUserMarker(coords: [number, number], heading: number | null): void {
    if (!this.map) return;

    if (!this.userMarker) {
      // Build custom 3D pulsing marker DOM
      const wrapper = document.createElement('div');
      wrapper.className = 'user-location-marker-wrapper';
      wrapper.title = 'Your Current Position';

      const radar = document.createElement('div');
      radar.className = 'user-marker-radar';

      const radarSec = document.createElement('div');
      radarSec.className = 'user-marker-radar-secondary';

      const core = document.createElement('div');
      core.className = 'user-marker-core';

      const headingIndicator = document.createElement('div');
      headingIndicator.className = 'user-marker-heading';

      wrapper.appendChild(radar);
      wrapper.appendChild(radarSec);
      wrapper.appendChild(core);
      wrapper.appendChild(headingIndicator);

      this.markerElement = wrapper;

      const popup = new mapboxgl.Popup({
        offset: 25,
        closeButton: false,
        className: 'user-loc-popup'
      }).setHTML(`
        <div style="font-family: var(--font-sans); font-size: 13px; line-height: 1.4;">
          <strong style="color: var(--accent-cyan); display: block; margin-bottom: 2px;">📍 Current Location</strong>
          <span style="color: var(--text-secondary); font-size: 11px;">GPS Accuracy: ±${this.lastLocation?.accuracy ?? 15}m</span>
        </div>
      `);

      this.userMarker = new mapboxgl.Marker({
        element: wrapper,
        rotationAlignment: 'map',
        pitchAlignment: 'map'
      })
        .setLngLat(coords)
        .setPopup(popup)
        .addTo(this.map);

      wrapper.addEventListener('click', () => {
        this.flyToUser();
      });
    } else {
      this.userMarker.setLngLat(coords);
      const popup = this.userMarker.getPopup();
      if (popup && this.lastLocation) {
        popup.setHTML(`
          <div style="font-family: var(--font-sans); font-size: 13px; line-height: 1.4;">
            <strong style="color: var(--accent-cyan); display: block; margin-bottom: 2px;">📍 Current Location</strong>
            <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); margin: 3px 0;">
              ${this.lastLocation.latitude.toFixed(4)}°, ${this.lastLocation.longitude.toFixed(4)}°
            </div>
            <span style="color: var(--text-secondary); font-size: 11px;">GPS Accuracy: ±${this.lastLocation.accuracy}m</span>
          </div>
        `);
      }
    }

    // Update heading pointer if available
    if (this.markerElement) {
      const headingEl = this.markerElement.querySelector('.user-marker-heading') as HTMLElement;
      if (headingEl) {
        if (heading !== null && heading !== undefined) {
          headingEl.style.display = 'block';
          headingEl.style.transform = `rotate(${heading}deg)`;
        } else {
          headingEl.style.display = 'none';
        }
      }
    }
  }

  public flyToUser(): void {
    if (!this.map) return;
    if (this.lastLocation) {
      this.flyToLocation([this.lastLocation.longitude, this.lastLocation.latitude], 17.0, 62);
    } else {
      this.startLocationTracking();
    }
  }

  public flyToHub(hubKey: keyof typeof TRANSIT_HUBS): void {
    const hub = TRANSIT_HUBS[hubKey];
    if (!hub || !this.map) return;
    this.map.flyTo({
      center: hub.coords,
      zoom: hub.zoom,
      pitch: this.is3DActive ? hub.pitch : 0,
      bearing: hub.bearing,
      essential: true,
      duration: 2500,
      curve: 1.42
    });
  }

  public flyToLocation(coords: [number, number], zoom = 16.5, pitch = 60): void {
    if (!this.map) return;
    this.map.flyTo({
      center: coords,
      zoom: zoom,
      pitch: this.is3DActive ? pitch : 0,
      bearing: this.map.getBearing(),
      essential: true,
      duration: 2200,
      curve: 1.35
    });
  }

  public toggle3D(): boolean {
    return this.setPerspective(!this.is3DActive);
  }

  public setPerspective(enable3D: boolean): boolean {
    if (!this.map) return enable3D;
    this.is3DActive = enable3D;

    this.map.easeTo({
      pitch: this.is3DActive ? 62 : 0,
      bearing: this.is3DActive ? -20 : 0,
      duration: 1200
    });

    window.dispatchEvent(
      new CustomEvent('motion:3d-state', { detail: { is3D: this.is3DActive } })
    );

    return this.is3DActive;
  }

  public setLightPreset(preset: 'night' | 'dusk' | 'dawn' | 'day'): void {
    this.currentLightPreset = preset;
    if (!this.map) return;
    try {
      if (this.map.setConfigProperty) {
        this.map.setConfigProperty('basemap', 'lightPreset', preset);
      }
    } catch (err) {
      console.warn('[MotionMap] Failed to set light preset:', err);
    }
  }

  public resetBearing(): void {
    if (!this.map) return;
    this.map.resetNorthPitch({ duration: 1000 });
  }

  private dispatchLocation(telemetry: LocationTelemetry): void {
    window.dispatchEvent(
      new CustomEvent<LocationTelemetry>('motion:location', { detail: telemetry })
    );
  }

  private dispatchStatus(status: { state: string; message: string }): void {
    window.dispatchEvent(
      new CustomEvent('motion:status', { detail: status })
    );
  }

  private dispatchRegion(regionName: string): void {
    window.dispatchEvent(
      new CustomEvent('motion:region-change', { detail: { regionName } })
    );
  }

  public destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.regionDebounceTimer) {
      clearTimeout(this.regionDebounceTimer);
      this.regionDebounceTimer = null;
    }
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}

export class MotionNavigationControl implements mapboxgl.IControl {
  private map?: mapboxgl.Map;
  private container?: HTMLElement;
  private btnZoomIn?: HTMLButtonElement;
  private btnZoomOut?: HTMLButtonElement;
  private btnPerspective?: HTMLButtonElement;
  private is3D: boolean = true;

  onAdd(map: mapboxgl.Map): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group motion-navigation-dock';

    // 1. Zoom In Button (+)
    this.btnZoomIn = document.createElement('button');
    this.btnZoomIn.className = 'motion-ctrl-btn motion-zoom-in';
    this.btnZoomIn.type = 'button';
    this.btnZoomIn.title = 'Zoom In';
    this.btnZoomIn.setAttribute('aria-label', 'Zoom In');
    this.btnZoomIn.innerHTML = `
      <svg class="motion-ctrl-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    this.btnZoomIn.onclick = (e) => {
      e.stopPropagation();
      this.map?.zoomIn({ duration: 300 });
    };

    // 2. Zoom Out Button (-)
    this.btnZoomOut = document.createElement('button');
    this.btnZoomOut.className = 'motion-ctrl-btn motion-zoom-out';
    this.btnZoomOut.type = 'button';
    this.btnZoomOut.title = 'Zoom Out';
    this.btnZoomOut.setAttribute('aria-label', 'Zoom Out');
    this.btnZoomOut.innerHTML = `
      <svg class="motion-ctrl-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    this.btnZoomOut.onclick = (e) => {
      e.stopPropagation();
      this.map?.zoomOut({ duration: 300 });
    };

    // 3. 2D / 3D Perspective Toggle Button (Cube for 3D, Square for 2D)
    this.btnPerspective = document.createElement('button');
    this.btnPerspective.className = 'motion-ctrl-btn motion-camera-toggle is-3d';
    this.btnPerspective.type = 'button';
    this.renderPerspectiveButton();
    this.btnPerspective.onclick = (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('motion:cmd:toggle-3d'));
    };

    this.container.appendChild(this.btnZoomIn);
    this.container.appendChild(this.btnZoomOut);
    this.container.appendChild(this.btnPerspective);

    window.addEventListener('motion:3d-state', this.on3DStateChange);

    return this.container;
  }

  private on3DStateChange = (e: Event) => {
    const is3D = (e as CustomEvent<{ is3D: boolean }>).detail?.is3D;
    if (typeof is3D === 'boolean') {
      this.is3D = is3D;
      this.renderPerspectiveButton();
    }
  };

  private renderPerspectiveButton() {
    if (!this.btnPerspective) return;
    if (this.is3D) {
      this.btnPerspective.className = 'motion-ctrl-btn motion-camera-toggle is-3d';
      this.btnPerspective.title = 'Switch to 2D Planar View (Currently 3D)';
      this.btnPerspective.setAttribute('aria-label', 'Switch to 2D Planar View');
      this.btnPerspective.innerHTML = `
        <svg class="motion-ctrl-icon cam-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span class="cam-btn-label">3D</span>
      `;
    } else {
      this.btnPerspective.className = 'motion-ctrl-btn motion-camera-toggle is-2d';
      this.btnPerspective.title = 'Switch to 3D Oblique Perspective (Currently 2D)';
      this.btnPerspective.setAttribute('aria-label', 'Switch to 3D Oblique Perspective');
      this.btnPerspective.innerHTML = `
        <svg class="motion-ctrl-icon cam-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5"></rect>
        </svg>
        <span class="cam-btn-label">2D</span>
      `;
    }
  }

  onRemove() {
    window.removeEventListener('motion:3d-state', this.on3DStateChange);
    this.container?.parentNode?.removeChild(this.container);
    this.map = undefined;
  }
}
