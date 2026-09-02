import mapboxgl from 'mapbox-gl';
import type { RouteResponse, RouteLeg } from '../../services/api';
import { getLegColor } from '../../services/api';

const ROUTE_SOURCE_ID = 'motion-route-lines-source';
const WAYPOINTS_SOURCE_ID = 'motion-route-waypoints-source';

const LAYER_HALO_ID = 'motion-route-halo-layer';
const LAYER_SOLID_ID = 'motion-route-solid-layer';
const LAYER_WALK_ID = 'motion-route-walk-layer';
const LAYER_WP_GLOW_ID = 'motion-route-waypoints-glow';
const LAYER_WP_CORE_ID = 'motion-route-waypoints-core';

/**
 * Owns the multi-modal transit route plotting on Mapbox GL.
 * Renders color-coded train, tram, bus, and walk legs with neon glow halo,
 * dashed pedestrian paths, station waypoint rings, and camera auto-framing.
 */
export class RouteLayerManager {
  private currentRoute: RouteResponse | null = null;
  private popup: mapboxgl.Popup | null = null;

  constructor(private map: mapboxgl.Map) {
    this.map.on('style.load', () => {
      if (this.currentRoute) {
        this.addLayers();
        this.updateData(this.currentRoute);
      }
    });
  }

  /**
   * Plots a calculated route itinerary onto the map.
   */
  render(route: RouteResponse): void {
    this.currentRoute = route;

    if (!this.map.isStyleLoaded()) {
      this.map.once('style.load', () => {
        if (this.currentRoute) {
          this.addLayers();
          this.updateData(this.currentRoute);
          this.fitRouteBounds(this.currentRoute);
        }
      });
      return;
    }

    if (!this.map.getSource(ROUTE_SOURCE_ID)) {
      this.addLayers();
    }
    this.updateData(route);
    this.fitRouteBounds(route);
  }

  /**
   * Initializes GeoJSON sources and line/circle layers on the active Mapbox style.
   */
  private addLayers(): void {
    if (this.map.getSource(ROUTE_SOURCE_ID)) return;

    // 1. Line strings source for route segments
    this.map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    // 2. Waypoints source for start, transfer, and destination stops
    this.map.addSource(WAYPOINTS_SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    // 3. Glowing neon underglow layer
    if (!this.map.getLayer(LAYER_HALO_ID)) {
      this.map.addLayer({
        id: LAYER_HALO_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            6,
            14,
            10,
            17,
            14,
          ],
          'line-opacity': 0.45,
          'line-blur': 3.5,
        },
      });
    }

    // 4. Solid transit tracks layer (Train, Tram, Bus)
    if (!this.map.getLayer(LAYER_SOLID_ID)) {
      this.map.addLayer({
        id: LAYER_SOLID_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        filter: ['!=', ['get', 'type'], 'WALK'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            3.5,
            14,
            5.5,
            17,
            7.5,
          ],
          'line-opacity': 0.95,
        },
      });
    }

    // 5. Walking / pedestrian dashed layer
    if (!this.map.getLayer(LAYER_WALK_ID)) {
      this.map.addLayer({
        id: LAYER_WALK_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        filter: ['==', ['get', 'type'], 'WALK'],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            2.5,
            14,
            4.0,
            17,
            5.5,
          ],
          'line-dasharray': [1.5, 2],
          'line-opacity': 0.9,
        },
      });
    }

    // 6. Waypoints outer glow ring
    if (!this.map.getLayer(LAYER_WP_GLOW_ID)) {
      this.map.addLayer({
        id: LAYER_WP_GLOW_ID,
        type: 'circle',
        source: WAYPOINTS_SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            8,
            14,
            14,
            17,
            18,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.35,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-pitch-alignment': 'viewport',
        },
      });
    }

    // 7. Waypoints inner crisp core dot
    if (!this.map.getLayer(LAYER_WP_CORE_ID)) {
      this.map.addLayer({
        id: LAYER_WP_CORE_ID,
        type: 'circle',
        source: WAYPOINTS_SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10,
            4.5,
            14,
            6.5,
            17,
            8.5,
          ],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
          'circle-pitch-alignment': 'viewport',
        },
      });
    }

    // Setup interactive tooltip on route legs and waypoints
    this.setupInteractivity();
  }

  /**
   * Prepares line features and waypoint point features from RouteResponse.
   */
  private updateData(route: RouteResponse): void {
    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const waypointFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];

    const legs = route.legs || [];

    legs.forEach((leg: RouteLeg, index: number) => {
      const color = getLegColor(leg);
      const coords = leg.coordinates || [];

      // If leg has coordinates, add as LineString
      if (coords.length >= 2) {
        lineFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: {
            legIndex: index,
            type: leg.type,
            mode: leg.mode,
            route: leg.route || '',
            color: color,
            is_replacement: Boolean(leg.is_replacement),
            duration_mins: leg.duration_mins,
            instruction: leg.instruction,
            from_stop: leg.from_stop || '',
            to_stop: leg.to_stop || '',
            start_time: leg.start_time,
            end_time: leg.end_time,
          },
        });
      }

      // Add Start Waypoint on first leg
      if (index === 0 && coords.length > 0) {
        waypointFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords[0],
          },
          properties: {
            kind: 'start',
            title: leg.from_stop || route.origin || 'Start Location',
            subtitle: `Depart at ${leg.start_time}`,
            color: '#10B981', // Emerald start
          },
        });
      }

      // Add Transfer Waypoints between transit legs
      if (index > 0 && index < legs.length && coords.length > 0) {
        waypointFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords[0],
          },
          properties: {
            kind: 'transfer',
            title: leg.from_stop || 'Interchange',
            subtitle: `${leg.mode} ${leg.route ? leg.route : ''} • ${leg.start_time}`,
            color: color,
          },
        });
      }

      // Add Destination Waypoint on last leg
      if (index === legs.length - 1 && coords.length > 0) {
        waypointFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: coords[coords.length - 1],
          },
          properties: {
            kind: 'destination',
            title: leg.to_stop || route.destination || 'Destination',
            subtitle: `Arrive at ${leg.end_time}`,
            color: '#F43F5E', // Rose destination
          },
        });
      }
    });

    // Update Line source
    const lineSrc = this.map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (lineSrc) {
      lineSrc.setData({
        type: 'FeatureCollection',
        features: lineFeatures,
      });
    }

    // Update Waypoint source
    const wpSrc = this.map.getSource(WAYPOINTS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    if (wpSrc) {
      wpSrc.setData({
        type: 'FeatureCollection',
        features: waypointFeatures,
      });
    }
  }

  /**
   * Calculates the bounding box across all legs and smoothly glides the camera.
   */
  private fitRouteBounds(route: RouteResponse): void {
    const coords: [number, number][] = [];

    (route.legs || []).forEach((leg) => {
      (leg.coordinates || []).forEach((pt) => {
        coords.push(pt);
      });
    });

    if (coords.length === 0) return;

    let minLon = coords[0][0];
    let maxLon = coords[0][0];
    let minLat = coords[0][1];
    let maxLat = coords[0][1];

    for (let i = 1; i < coords.length; i++) {
      const [lon, lat] = coords[i];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const bounds = new mapboxgl.LngLatBounds([minLon, minLat], [maxLon, maxLat]);

    try {
      this.map.fitBounds(bounds, {
        padding: {
          top: 90,
          bottom: 270,
          left: 50,
          right: 50,
        },
        pitch: 42,
        bearing: -17,
        maxZoom: 16.5,
        duration: 1600,
        essential: true,
      });
    } catch (e) {
      console.warn('[RouteLayerManager] fitBounds notice:', e);
    }
  }

  /**
   * Sets up hover/click tooltips for route segments and waypoint nodes.
   */
  private setupInteractivity(): void {
    const showTooltip = (e: any) => {
      const features = e.features;
      if (!features || features.length === 0) return;

      const feat = features[0];
      const props = feat.properties || {};

      this.popup?.remove();

      const title = props.title || props.instruction || `${props.mode} ${props.route || ''}`;
      const subtitle = props.subtitle || `${props.start_time || ''} → ${props.end_time || ''} (${props.duration_mins || 0}m)`;
      const color = props.color || '#38BDF8';

      const html = `
        <div class="motion-route-popup" style="background: rgba(10, 15, 29, 0.9); backdrop-filter: blur(12px); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; padding: 10px 14px; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; box-shadow: 0 0 8px ${color};"></span>
            <span>${title}</span>
          </div>
          ${subtitle ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px; font-family: 'JetBrains Mono', monospace;">${subtitle}</div>` : ''}
        </div>
      `;

      this.popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: 'motion-glass-popup',
      })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(this.map);
    };

    const hideTooltip = () => {
      this.popup?.remove();
      this.popup = null;
    };

    // Solid & Walk lines interactivity
    [LAYER_SOLID_ID, LAYER_WALK_ID, LAYER_WP_CORE_ID].forEach((layerId) => {
      if (this.map.getLayer(layerId)) {
        this.map.on('mouseenter', layerId, (e) => {
          this.map.getCanvas().style.cursor = 'pointer';
          showTooltip(e);
        });
        this.map.on('mouseleave', layerId, () => {
          this.map.getCanvas().style.cursor = '';
          hideTooltip();
        });
      }
    });
  }

  /**
   * Cleans up all route layers, sources, and popups from the map.
   */
  clear(): void {
    this.currentRoute = null;
    this.popup?.remove();
    this.popup = null;

    try {
      if (this.map.getLayer(LAYER_WP_CORE_ID)) this.map.removeLayer(LAYER_WP_CORE_ID);
      if (this.map.getLayer(LAYER_WP_GLOW_ID)) this.map.removeLayer(LAYER_WP_GLOW_ID);
      if (this.map.getLayer(LAYER_WALK_ID)) this.map.removeLayer(LAYER_WALK_ID);
      if (this.map.getLayer(LAYER_SOLID_ID)) this.map.removeLayer(LAYER_SOLID_ID);
      if (this.map.getLayer(LAYER_HALO_ID)) this.map.removeLayer(LAYER_HALO_ID);

      if (this.map.getSource(WAYPOINTS_SOURCE_ID)) this.map.removeSource(WAYPOINTS_SOURCE_ID);
      if (this.map.getSource(ROUTE_SOURCE_ID)) this.map.removeSource(ROUTE_SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}
