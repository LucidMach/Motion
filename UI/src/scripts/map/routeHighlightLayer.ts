import mapboxgl from 'mapbox-gl';

const SOURCE_ID = 'motion-route-highlight-source';
const LAYER_HALO_ID = 'motion-route-highlight-halo';
const LAYER_SOLID_ID = 'motion-route-highlight-solid';
const LAYER_CORE_ID = 'motion-route-highlight-core';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Owns the single "picked route" overlay drawn from the TransitDock's route
 * picker - a neon halo + solid line over every LineString feature in a route's
 * shape, with camera framing to fit. Unlike RouteLayerManager (a calculated
 * multi-leg itinerary), this always renders one flat accent color for one route.
 */
export class RouteHighlightLayer {
  private hasRoute = false;

  constructor(private map: mapboxgl.Map) {
    this.map.on('style.load', () => {
      if (this.hasRoute) {
        this.addLayers();
      }
    });
  }

  private addLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;

    this.map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });

    // 1. Luminous Neon Underglow Halo
    if (!this.map.getLayer(LAYER_HALO_ID)) {
      this.map.addLayer({
        id: LAYER_HALO_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 14, 15, 20, 18, 28],
          'line-opacity': 0.75,
          'line-blur': 4,
          'line-emissive-strength': 0.9
        }
      });
    }

    // 2. High-Contrast Solid Corridor Track
    if (!this.map.getLayer(LAYER_SOLID_ID)) {
      this.map.addLayer({
        id: LAYER_SOLID_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 12, 7, 15, 10, 18, 14],
          'line-opacity': 1.0,
          'line-emissive-strength': 1.0
        }
      });
    }

    // 3. Crisp Illuminated Core Rail (makes dark lines like Lilydale/Belgrave pop instantly)
    if (!this.map.getLayer(LAYER_CORE_ID)) {
      this.map.addLayer({
        id: LAYER_CORE_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 2.5, 15, 3.5, 18, 5],
          'line-opacity': 0.85,
          'line-emissive-strength': 1.0
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
  render(featureCollection: GeoJSON.FeatureCollection, color: string, skipCameraFit = false): void {
    this.hasRoute = true;

    if (!this.map.isStyleLoaded()) {
      this.map.once('style.load', () => this.render(featureCollection, color, skipCameraFit));
      return;
    }

    if (!this.map.getSource(SOURCE_ID)) {
      this.addLayers();
    }

    const colored: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (featureCollection.features || []).map((f) => ({
        ...f,
        properties: { ...f.properties, color }
      }))
    };

    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
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

      this.map.fitBounds(new mapboxgl.LngLatBounds([minLon, minLat], [maxLon, maxLat]), {
        padding: { top: topPad, bottom: bottomPad, left: leftPad, right: rightPad },
        pitch: 0,
        bearing: 0,
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
    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(EMPTY_FC);
  }

  destroy(): void {
    this.hasRoute = false;
    try {
      if (this.map.getLayer(LAYER_CORE_ID)) this.map.removeLayer(LAYER_CORE_ID);
      if (this.map.getLayer(LAYER_SOLID_ID)) this.map.removeLayer(LAYER_SOLID_ID);
      if (this.map.getLayer(LAYER_HALO_ID)) this.map.removeLayer(LAYER_HALO_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}
