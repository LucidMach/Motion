import mapboxgl from 'mapbox-gl';

const SOURCE_ID = 'motion-route-highlight-source';
const LAYER_HALO_ID = 'motion-route-highlight-halo';
const LAYER_SOLID_ID = 'motion-route-highlight-solid';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Owns the single "picked route" overlay drawn from the TransitDock's route
 * picker - a neon halo + solid line over every LineString feature in a route's
 * shape, with camera framing to fit. Unlike RouteLayerManager (a calculated
 * multi-leg itinerary), this always renders one flat accent color for one route.
 */
function boostRouteColor(color: string): string {
  if (!color) return '#0072CE';
  // Boost low-luminance dark navy (#152C6B) to vibrant royal blue so it pops against 3D buildings
  if (color.toUpperCase() === '#152C6B') {
    return '#1D4ED8';
  }
  return color;
}

/**
 * Owns the single "picked route" overlay drawn from the TransitDock's route
 * picker - a neon halo + solid line over every LineString feature in a route's
 * shape, with camera framing to fit. Unlike RouteLayerManager (a calculated
 * multi-leg itinerary), this always renders one flat accent color for one route.
 */
export class RouteHighlightLayer {
  private hasRoute = false;
  private currentData: GeoJSON.FeatureCollection | null = null;
  private currentColor: string | null = null;

  constructor(private map: mapboxgl.Map) {
    this.map.on('style.load', () => {
      if (this.hasRoute && this.currentData) {
        this.addLayers();
        const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        source?.setData(this.currentData);
      }
    });
  }

  private safeAddLayer(layer: any): void {
    try {
      this.map.addLayer(layer);
    } catch {
      if (layer.slot) {
        const { slot, ...withoutSlot } = layer;
        try {
          this.map.addLayer(withoutSlot);
        } catch (err) {
          console.warn(`[RouteHighlightLayer] Failed to add layer ${layer.id}:`, err);
        }
      }
    }
  }

  private addLayers(): void {
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, { type: 'geojson', data: this.currentData || EMPTY_FC });
    }

    // 1. Glowing neon underglow layer in route color
    if (!this.map.getLayer(LAYER_HALO_ID)) {
      this.safeAddLayer({
        id: LAYER_HALO_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#0072CE'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 10, 17, 14],
          'line-opacity': 0.45,
          'line-blur': 3.5,
        }
      });
    }

    // 2. High-Contrast Solid Corridor Track in route color
    if (!this.map.getLayer(LAYER_SOLID_ID)) {
      this.safeAddLayer({
        id: LAYER_SOLID_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#0072CE'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 14, 5.5, 17, 7.5],
          'line-opacity': 0.95,
        }
      });
    }
  }

  /**
   * Renders a route's shape, stamping the accent color onto every feature.
   * By default also fits the camera to the route's bounds - pass
   * skipCameraFit when the caller is about to issue its own camera command
   * (e.g. flying to a specific vehicle on the route) to avoid two competing
   * camera animations racing each other.
   */
  render(featureCollection: GeoJSON.FeatureCollection, rawColor: string, skipCameraFit = false): void {
    const color = boostRouteColor(rawColor);
    this.hasRoute = true;
    this.currentColor = color;

    const colored: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (featureCollection.features || []).map((f) => ({
        ...f,
        properties: { ...f.properties, color: color || f.properties?.color || '#0072CE' }
      }))
    };
    this.currentData = colored;

    if (!this.map.isStyleLoaded()) {
      this.map.once('style.load', () => this.render(featureCollection, rawColor, skipCameraFit));
      return;
    }

    this.addLayers();

    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(colored);

    if (!skipCameraFit) {
      this.fitBounds(colored);
    }
  }

  private fitBounds(fc: GeoJSON.FeatureCollection): void {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const feature of fc.features) {
      if (feature.geometry.type === 'LineString') {
        for (const [lon, lat] of feature.geometry.coordinates as [number, number][]) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      } else if (feature.geometry.type === 'MultiLineString') {
        for (const line of (feature.geometry as any).coordinates as [number, number][][]) {
          for (const [lon, lat] of line) {
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }
    }

    if (minLon === Infinity) return;

    try {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      const explorerOpen =
        typeof document !== 'undefined' &&
        document.getElementById('transit-explorer-panel')?.classList.contains('translate-x-0');
      const vehiclePanelOpen =
        typeof document !== 'undefined' &&
        document.getElementById('vehicle-panel')?.classList.contains('translate-x-0');

      const canvasWidth =
        this.map.getCanvas()?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
      const canvasHeight =
        this.map.getCanvas()?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);

      let leftPad = isDesktop && explorerOpen ? 490 : 40;
      let rightPad = isDesktop && vehiclePanelOpen ? 320 : 40;
      let topPad = 60;
      let bottomPad = 80;

      // Ensure horizontal padding doesn't exceed 65% of viewport
      if (leftPad + rightPad >= canvasWidth * 0.7) {
        const factor = (canvasWidth * 0.6) / (leftPad + rightPad);
        leftPad = Math.max(20, Math.round(leftPad * factor));
        rightPad = Math.max(20, Math.round(rightPad * factor));
      }

      // Ensure vertical padding doesn't exceed 50% of viewport
      if (topPad + bottomPad >= canvasHeight * 0.5) {
        topPad = 30;
        bottomPad = 30;
      }

      const currentPitch = this.map.getPitch();
      const currentBearing = this.map.getBearing();
      this.map.fitBounds(new mapboxgl.LngLatBounds([minLon, minLat], [maxLon, maxLat]), {
        padding: { top: topPad, bottom: bottomPad, left: leftPad, right: rightPad },
        pitch: currentPitch > 25 ? 45 : currentPitch,
        bearing: currentBearing,
        maxZoom: 15.0,
        duration: 1200,
        essential: true
      });
    } catch (e) {
      console.warn('[RouteHighlightLayer] fitBounds notice:', e);
    }
  }

  clear(): void {
    this.hasRoute = false;
    this.currentData = null;
    this.currentColor = null;
    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(EMPTY_FC);
  }

  destroy(): void {
    this.hasRoute = false;
    try {
      if (this.map.getLayer(LAYER_SOLID_ID)) this.map.removeLayer(LAYER_SOLID_ID);
      if (this.map.getLayer(LAYER_HALO_ID)) this.map.removeLayer(LAYER_HALO_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}
