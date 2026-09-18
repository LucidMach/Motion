import mapboxgl from 'mapbox-gl';
import { motionApi } from '../../services/api';

const SOURCE_ID = 'motion-train-sim-source';
const LAYER_ID = 'motion-train-sim-layer';

const POLL_INTERVAL_MS = 4000;

// Stylized low-poly capsule dimensions (meters) - not to scale with a real
// train consist, sized to read clearly as a "pill" against the 3D buildings.
const TRAIN_LENGTH_M = 40;
const TRAIN_WIDTH_M = 9;
const TRAIN_HEIGHT_M = 4.5;
const CAP_SEGMENTS = 6;

const METERS_PER_DEGREE_LAT = 111320;

interface LiveTrainProps {
  trip_id: string;
  route_short_name: string;
  color: string;
  bearing_deg: number;
}

interface AnimatedTrain {
  fromLon: number;
  fromLat: number;
  fromBearing: number;
  toLon: number;
  toLat: number;
  toBearing: number;
  props: LiveTrainProps;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Shortest-path interpolation between two compass bearings (handles the 350deg -> 10deg wrap). */
function lerpBearing(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/**
 * Builds a low-poly capsule (stadium shape) footprint centered on [lon, lat],
 * oriented so its long axis points along `bearingDeg` (compass degrees).
 * Uses a flat-earth meter approximation - accurate enough at this scale.
 */
function buildPillRing(lon: number, lat: number, bearingDeg: number): [number, number][] {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const forward: [number, number] = [Math.sin(bearingRad), Math.cos(bearingRad)]; // [east, north]
  const right: [number, number] = [Math.cos(bearingRad), -Math.sin(bearingRad)];

  const radius = TRAIN_WIDTH_M / 2;
  const halfStraight = Math.max(0, TRAIN_LENGTH_M / 2 - radius);
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);

  const localPoints: [number, number][] = [];

  // Front cap: sweep from -90deg (right side) through 0deg (forward) to +90deg (left side)
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const a = (-90 + (180 * i) / CAP_SEGMENTS) * (Math.PI / 180);
    localPoints.push([halfStraight + radius * Math.cos(a), radius * Math.sin(a)]);
  }
  // Back cap: sweep from +90deg through 180deg to +270deg (i.e. -90deg)
  for (let i = 0; i <= CAP_SEGMENTS; i++) {
    const a = (90 + (180 * i) / CAP_SEGMENTS) * (Math.PI / 180);
    localPoints.push([-halfStraight + radius * Math.cos(a), radius * Math.sin(a)]);
  }

  const ring: [number, number][] = localPoints.map(([fwd, rgt]) => {
    const eastM = fwd * forward[0] + rgt * right[0];
    const northM = fwd * forward[1] + rgt * right[1];
    return [lon + eastM / metersPerDegreeLon, lat + northM / METERS_PER_DEGREE_LAT];
  });

  ring.push(ring[0]);
  return ring;
}

/**
 * Owns the network-wide low-poly train simulation layer: polls schedule-derived
 * live train positions and renders each as an extruded pill oriented along its
 * direction of travel, smoothly animating between polls.
 *
 * Positions are simulated by interpolating the static GTFS timetable against
 * the current time (see server/services/train_simulation_service.py) - there is
 * no live GPS feed wired in yet. Once a verified PTV GTFS-Realtime Vehicle
 * Positions feed URL is available, the backend endpoint this polls can start
 * returning real positions (falling back to simulation where the feed has no
 * data) without any change needed on this side - it only ever consumes the
 * GeoJSON FeatureCollection shape already returned by /api/network/trains/live.
 */
export class TrainSimulationLayer {
  private trains = new Map<string, AnimatedTrain>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private animStart = 0;
  private running = false;

  constructor(private map: mapboxgl.Map) {
    this.map.on('style.load', () => this.addLayers());
    if (this.map.isStyleLoaded()) {
      this.addLayers();
    }
  }

  private addLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;

    this.map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });

    this.map.addLayer({
      id: LAYER_ID,
      type: 'fill-extrusion',
      source: SOURCE_ID,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': TRAIN_HEIGHT_M,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': false
      }
    });

    // If the layer is being re-added after a style swap while the simulation
    // was already running, repaint immediately instead of waiting for the next poll.
    if (this.running) {
      this.render(1);
    }
  }

  /** Starts polling live train positions and animating them on the map. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.tick();
  }

  private async poll(): Promise<void> {
    let featureCollection: GeoJSON.FeatureCollection;
    try {
      featureCollection = await motionApi.getLiveTrains();
    } catch (e) {
      console.warn('[TrainSimulationLayer] Failed to fetch live train positions:', e);
      return;
    }

    const seenTripIds = new Set<string>();

    for (const feature of featureCollection.features) {
      if (feature.geometry.type !== 'Point') continue;
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as unknown as LiveTrainProps;
      if (!props?.trip_id) continue;

      seenTripIds.add(props.trip_id);
      const existing = this.trains.get(props.trip_id);

      if (existing) {
        existing.fromLon = existing.toLon;
        existing.fromLat = existing.toLat;
        existing.fromBearing = existing.toBearing;
        existing.toLon = lon;
        existing.toLat = lat;
        existing.toBearing = props.bearing_deg;
        existing.props = props;
      } else {
        this.trains.set(props.trip_id, {
          fromLon: lon,
          fromLat: lat,
          fromBearing: props.bearing_deg,
          toLon: lon,
          toLat: lat,
          toBearing: props.bearing_deg,
          props
        });
      }
    }

    // Drop trains that have finished their trip (no longer in the feed).
    for (const tripId of this.trains.keys()) {
      if (!seenTripIds.has(tripId)) this.trains.delete(tripId);
    }

    this.animStart = performance.now();
  }

  private tick = (): void => {
    if (!this.running) return;

    const elapsed = performance.now() - this.animStart;
    const t = Math.min(1, elapsed / POLL_INTERVAL_MS);
    this.render(t);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(t: number): void {
    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const features: GeoJSON.Feature[] = [];
    for (const train of this.trains.values()) {
      const lon = train.fromLon + (train.toLon - train.fromLon) * t;
      const lat = train.fromLat + (train.toLat - train.fromLat) * t;
      const bearing = lerpBearing(train.fromBearing, train.toBearing, t);

      features.push({
        type: 'Feature',
        properties: {
          trip_id: train.props.trip_id,
          route_short_name: train.props.route_short_name,
          color: train.props.color
        },
        geometry: { type: 'Polygon', coordinates: [buildPillRing(lon, lat, bearing)] }
      });
    }

    source.setData({ type: 'FeatureCollection', features });
  }

  /** Stops polling/animation and removes the layer and source from the map. */
  destroy(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.trains.clear();

    try {
      if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}
