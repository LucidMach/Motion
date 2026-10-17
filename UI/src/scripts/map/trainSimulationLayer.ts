import mapboxgl from 'mapbox-gl';
import { motionApi } from '../../services/api';

const SOURCE_ID = 'motion-train-sim-source';
const LAYER_ID = 'motion-train-sim-layer';

const POLL_INTERVAL_MS = 4000;

// Train low-poly capsule dimensions (meters)
const TRAIN_LENGTH_M = 40;
const TRAIN_WIDTH_M = 9;
const TRAIN_HEIGHT_M = 4.5;

// Tram low-poly capsule dimensions (meters) - scaled to Melbourne street grids
const TRAM_LENGTH_M = 26;
const TRAM_WIDTH_M = 4.8;
const TRAM_HEIGHT_M = 3.6;

const CAP_SEGMENTS = 6;
const METERS_PER_DEGREE_LAT = 111320;

export interface LiveVehicleProps {
  trip_id: string;
  route_short_name: string;
  route_long_name?: string;
  mode?: 'train' | 'tram';
  color: string;
  bearing_deg: number;
  progress?: number;
  path?: [number, number][];
  status?: 'in_transit' | 'dwelling';
  from_stop_id?: string;
  to_stop_id?: string;
  from_stop_name?: string;
  to_stop_name?: string;
  current_stop_id?: string;
  current_stop_name?: string;
  destination?: string;
  direction_id?: number;
  is_stopped?: boolean;
}

interface AnimatedVehicle {
  props: LiveVehicleProps;
  path: [number, number][];
  segmentDistances: number[];
  totalDistance: number;
  lastKnownBearing: number;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Flat-earth distance between two points in meters. */
function segmentDistanceMeters(a: [number, number], b: [number, number]): number {
  const avgLatRad = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.cos(avgLatRad);
  const dx = (b[0] - a[0]) * metersPerDegLon;
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Precomputes segment distances and total path distance in meters. */
function computePathDistances(path: [number, number][]): { segmentDistances: number[]; totalDistance: number } {
  const segmentDistances: number[] = [];
  let totalDistance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const dist = segmentDistanceMeters(path[i], path[i + 1]);
    segmentDistances.push(dist);
    totalDistance += dist;
  }
  return { segmentDistances, totalDistance };
}

/**
 * Traverses `path` by distance $t \times \text{totalDistance}$ across all
 * intermediate vertices, computing exact coordinate and segment heading.
 * Ensures vehicles never cut across corners or derail into buildings.
 */
function pointAndBearingAlongPath(
  path: [number, number][],
  segmentDistances: number[],
  totalDistance: number,
  fallbackBearing: number,
  t: number
): { coords: [number, number]; bearing: number } {
  if (path.length === 0) return { coords: [0, 0], bearing: fallbackBearing };
  if (path.length === 1 || totalDistance < 0.001) return { coords: path[0], bearing: fallbackBearing };

  const targetDist = Math.max(0, Math.min(totalDistance, t * totalDistance));
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    const segDist = segmentDistances[i];
    if (targetDist <= accumulated + segDist || i === segmentDistances.length - 1) {
      const segT = segDist > 0 ? (targetDist - accumulated) / segDist : 0;
      const clampedSegT = Math.max(0, Math.min(1, segT));
      const a = path[i];
      const b = path[i + 1];
      const lon = a[0] + (b[0] - a[0]) * clampedSegT;
      const lat = a[1] + (b[1] - a[1]) * clampedSegT;

      let bearing = fallbackBearing;
      const dLon = b[0] - a[0];
      const dLat = b[1] - a[1];
      if (Math.abs(dLon) > 1e-7 || Math.abs(dLat) > 1e-7) {
        const rad = Math.atan2(
          dLon * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180),
          dLat
        );
        bearing = ((rad * 180) / Math.PI + 360) % 360;
      }
      return { coords: [lon, lat], bearing };
    }
    accumulated += segDist;
  }

  return { coords: path[path.length - 1], bearing: fallbackBearing };
}

/**
 * Builds a low-poly capsule (stadium shape) footprint centered on [lon, lat],
 * oriented so its long axis points along `bearingDeg` (compass degrees).
 */
function buildPillRing(
  lon: number,
  lat: number,
  bearingDeg: number,
  lengthM: number,
  widthM: number
): [number, number][] {
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const forward: [number, number] = [Math.sin(bearingRad), Math.cos(bearingRad)]; // [east, north]
  const right: [number, number] = [Math.cos(bearingRad), -Math.sin(bearingRad)];

  const radius = widthM / 2;
  const halfStraight = Math.max(0, lengthM / 2 - radius);
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
 * Owns the network-wide 3D vehicle simulation layer: polls schedule-derived
 * live positions for Melbourne Metro trains and Yarra Trams.
 *
 * Each vehicle smoothly traverses intermediate polyline vertices along its
 * physical track shape across curves, preventing straight-chord derailment.
 */
export class TrainSimulationLayer {
  private vehicles = new Map<string, AnimatedVehicle>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;
  private animStart = 0;
  private running = false;
  private trackedTripId: string | null = null;
  private onTrackVehicleHandler: ((e: Event) => void) | null = null;
  private onClearRouteHandler: (() => void) | null = null;

  constructor(private map: mapboxgl.Map) {
    this.map.on('style.load', () => this.addLayers());
    this.setupTrackingListeners();
    if (this.map.isStyleLoaded()) {
      this.addLayers();
    }
  }

  private setupTrackingListeners(): void {
    this.map.on('dragstart', () => { this.trackedTripId = null; });
    this.map.on('rotatestart', () => { this.trackedTripId = null; });
    this.map.on('pitchstart', () => { this.trackedTripId = null; });

    this.onTrackVehicleHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ tripId: string; coords: [number, number]; bearing?: number }>).detail;
      if (detail?.tripId) {
        this.trackedTripId = detail.tripId;
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
        const explorerOpen =
          typeof document !== 'undefined' &&
          document.getElementById('transit-explorer-panel')?.classList.contains('translate-x-0');
        const padding = {
          top: 60,
          bottom: 100,
          left: isDesktop && explorerOpen ? 500 : 40,
          right: 40
        };
        this.map.flyTo({
          center: detail.coords,
          zoom: 18,
          pitch: 65,
          bearing: detail.bearing !== undefined ? detail.bearing : this.map.getBearing(),
          padding,
          essential: true,
          duration: 1800
        });
      }
    };
    window.addEventListener('motion:cmd:track-vehicle', this.onTrackVehicleHandler);

    this.onClearRouteHandler = () => {
      this.trackedTripId = null;
    };
    window.addEventListener('motion:cmd:clear-route-highlight', this.onClearRouteHandler);
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
        'fill-extrusion-height': ['coalesce', ['get', 'height'], TRAIN_HEIGHT_M],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-emissive-strength': 0.95
      }
    });

    this.map.on('click', LAYER_ID, (e) => {
      (window as any).__lastVehicleClickTime = Date.now();
      if (e.features && e.features[0]) {
        const props = e.features[0].properties as any;
        const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        window.dispatchEvent(
          new CustomEvent('motion:vehicle-selected', {
            detail: {
              tripId: props?.trip_id,
              routeShortName: props?.route_short_name,
              color: props?.color,
              coords,
              mode: props?.mode || 'train',
              bearing: props?.bearing_deg,
              fromStopId: props?.from_stop_id,
              toStopId: props?.to_stop_id,
              fromStopName: props?.from_stop_name,
              toStopName: props?.to_stop_name,
              destination: props?.destination,
              status: props?.status,
              isStopped: props?.is_stopped,
              progress: props?.progress
            }
          })
        );
      }
    });

    this.map.on('mouseenter', LAYER_ID, () => {
      this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', LAYER_ID, () => {
      this.map.getCanvas().style.cursor = '';
    });

    if (this.running) {
      this.render(1);
    }
  }

  /** Starts polling live vehicle positions and animating them on the map. */
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
      featureCollection = await motionApi.getLiveVehicles('all');
    } catch {
      try {
        featureCollection = await motionApi.getLiveTrains();
      } catch (e) {
        console.warn('[TrainSimulationLayer] Failed to fetch live vehicle positions:', e);
        return;
      }
    }

    const seenTripIds = new Set<string>();

    for (const feature of featureCollection.features) {
      if (feature.geometry.type !== 'Point') continue;
      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const props = feature.properties as unknown as LiveVehicleProps;
      if (!props?.trip_id) continue;

      seenTripIds.add(props.trip_id);

      // Intermediate track vertices for curve-following
      let path: [number, number][];
      if (props.path && props.path.length >= 2) {
        path = props.path;
      } else {
        const existing = this.vehicles.get(props.trip_id);
        const prevPoint = existing && existing.path.length > 0
          ? existing.path[existing.path.length - 1]
          : [lon, lat];
        path = [prevPoint as [number, number], [lon, lat]];
      }

      const { segmentDistances, totalDistance } = computePathDistances(path);

      this.vehicles.set(props.trip_id, {
        props,
        path,
        segmentDistances,
        totalDistance,
        lastKnownBearing: props.bearing_deg || 0
      });
    }

    // Drop vehicles that have finished their trip
    for (const tripId of this.vehicles.keys()) {
      if (!seenTripIds.has(tripId)) this.vehicles.delete(tripId);
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
    for (const vehicle of this.vehicles.values()) {
      const isTram = vehicle.props.mode === 'tram';
      const lengthM = isTram ? TRAM_LENGTH_M : TRAIN_LENGTH_M;
      const widthM = isTram ? TRAM_WIDTH_M : TRAIN_WIDTH_M;
      const heightM = isTram ? TRAM_HEIGHT_M : TRAIN_HEIGHT_M;

      const { coords, bearing } = pointAndBearingAlongPath(
        vehicle.path,
        vehicle.segmentDistances,
        vehicle.totalDistance,
        vehicle.lastKnownBearing,
        t
      );

      if (this.trackedTripId && vehicle.props.trip_id === this.trackedTripId) {
        if (!this.map.isMoving() || this.map.isEasing()) {
          this.map.easeTo({
            center: coords,
            bearing,
            pitch: 65,
            duration: 120,
            easing: (x) => x
          });
        }
      }

      features.push({
        type: 'Feature',
        properties: {
          trip_id: vehicle.props.trip_id,
          route_short_name: vehicle.props.route_short_name,
          color: vehicle.props.color,
          mode: vehicle.props.mode || 'train',
          height: heightM,
          bearing_deg: bearing,
          from_stop_id: vehicle.props.from_stop_id,
          to_stop_id: vehicle.props.to_stop_id,
          from_stop_name: vehicle.props.from_stop_name,
          to_stop_name: vehicle.props.to_stop_name,
          destination: vehicle.props.destination,
          status: vehicle.props.status,
          is_stopped: vehicle.props.is_stopped,
          progress: vehicle.props.progress
        },
        geometry: {
          type: 'Polygon',
          coordinates: [buildPillRing(coords[0], coords[1], bearing, lengthM, widthM)]
        }
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
    if (this.onTrackVehicleHandler) {
      window.removeEventListener('motion:cmd:track-vehicle', this.onTrackVehicleHandler);
    }
    if (this.onClearRouteHandler) {
      window.removeEventListener('motion:cmd:clear-route-highlight', this.onClearRouteHandler);
    }
    this.vehicles.clear();

    try {
      if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
      if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
    } catch {
      // Safe catch if style is being torn down
    }
  }
}

