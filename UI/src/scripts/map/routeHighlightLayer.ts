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

    this.map.addLayer({
      id: LAYER_HALO_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 12, 17, 16],
        'line-opacity': 0.4,
        'line-blur': 4
      }
    });

    this.map.addLayer({
      id: LAYER_SOLID_ID,
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 4.5, 17, 6],
        'line-opacity': 0.95,
        'line-emissive-strength': 0.55
      }
    });
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
      features: featureCollection.features.map((f) => ({
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
      if (feature.geometry.type !== 'LineString') continue;
      for (const [lon, lat] of feature.geometry.coordinates as [number, number][]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    if (minLon === Infinity) return;

    try {
      this.map.fitBounds(new mapboxgl.LngLatBounds([minLon, minLat], [maxLon, maxLat]), {
        padding: { top: 100, bottom: 200, left: 60, right: 60 },
        pitch: 45,
        maxZoom: 15.5,
        duration: 1400,
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
      if (this.map.getLayer(LAYER_SOLID_ID)) this.map.removeLayer(LAYER_SOLID_ID);
      if (this.map.getLayer(LAYER_HALO_ID)) this.map.removeLayer(LAYER_HALO_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}
