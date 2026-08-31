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

export class MotionMapController {
  private map: mapboxgl.Map | null = null;
  private userMarker: mapboxgl.Marker | null = null;
  private markerElement: HTMLElement | null = null;
  private watchId: number | null = null;
  private lastLocation: LocationTelemetry | null = null;
  private is3DActive: boolean = true;
  private currentLightPreset: string = 'night';
  private token: string = '';

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

      // Add navigation controls
      this.map.addControl(
        new mapboxgl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true
        }),
        'bottom-right'
      );

      this.map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-left'
      );

      this.map.on('load', () => {
        console.log('[MotionMap] Map load event fired.');
        this.map?.resize();
        this.configureMoonlightAtmosphere();
        this.dispatchStatus({ state: 'ready', message: 'Moonlight 3D Engine Active' });
      });

      this.map.on('style.load', () => {
        console.log('[MotionMap] Map style.load event fired.');
        this.map?.resize();
        this.configureMoonlightAtmosphere();
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

  private configureMoonlightAtmosphere(): void {
    if (!this.map) return;

    try {
      const mapAny = this.map as any;
      // Configure Standard Style lighting preset to "night" (Moonlight aesthetic)
      if (typeof mapAny.setConfigProperty === 'function') {
        mapAny.setConfigProperty('basemap', 'lightPreset', this.currentLightPreset);
        mapAny.setConfigProperty('basemap', 'show3dObjects', true);
        mapAny.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
        mapAny.setConfigProperty('basemap', 'showTransitLabels', true);
      }

      // Add 3D building extrusions fallback layer for custom/classic styles
      if (!this.map.getLayer('3d-buildings') && this.map.getSource('composite')) {
        const layers = this.map.getStyle()?.layers;
        const labelLayerId = layers?.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
        )?.id;

        this.map.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                0, '#0f172a',
                50, '#1e293b',
                120, '#334155',
                250, '#1e1b4b'
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                14.5, ['get', 'height']
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13, 0,
                14.5, ['get', 'min_height']
              ],
              'fill-extrusion-opacity': 0.85
            }
          },
          labelLayerId
        );
      }

      // Set moonlight atmospheric fog
      if (typeof mapAny.setFog === 'function') {
        mapAny.setFog({
          range: [0.5, 10],
          color: '#070a13',
          'horizon-blend': 0.15,
          'high-color': '#0f172a',
          'space-color': '#030712',
          'star-intensity': 0.85
        });
      }
    } catch (e) {
      console.warn('[MotionMap] Atmosphere configuration note:', e);
    }
  }

  public startLocationTracking(): void {
    if (!navigator.geolocation) {
      this.dispatchStatus({ state: 'gps_unsupported', message: 'Geolocation Not Supported' });
      this.emitDefaultLocation();
      return;
    }

    this.dispatchStatus({ state: 'gps_acquiring', message: 'Acquiring GPS Signal...' });

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

    this.lastLocation = {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      altitude: altitude ? Math.round(altitude) : null,
      altitudeAccuracy: altitudeAccuracy ? Math.round(altitudeAccuracy) : null,
      heading: heading !== null && !isNaN(heading) ? Math.round(heading) : null,
      speed: speed !== null && !isNaN(speed) ? Math.round(speed * 3.6) : null, // km/h
      timestamp: pos.timestamp,
      source: 'gps'
    };

    this.renderUserMarker([longitude, latitude], this.lastLocation.heading);
    this.dispatchLocation(this.lastLocation);
    this.dispatchStatus({ state: 'gps_active', message: `GPS Locked (±${this.lastLocation.accuracy}m)` });

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
    const message = err.code === 1 ? 'GPS Permission Denied' : 'GPS Signal Weak (Using Melbourne CBD)';
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
      source: 'default'
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
          <span style="color: var(--text-secondary); font-size: 11px;">GPS Live Lock</span>
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
            <span style="color: var(--text-secondary); font-size: 11px;">Accuracy: ±${this.lastLocation.accuracy}m</span>
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
      pitch: hub.pitch,
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
    if (!this.map) return this.is3DActive;
    this.is3DActive = !this.is3DActive;

    this.map.easeTo({
      pitch: this.is3DActive ? 62 : 0,
      bearing: this.is3DActive ? -20 : 0,
      duration: 1200
    });

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

  public destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
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
