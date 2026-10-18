import mapboxgl from 'mapbox-gl';
import { motionApi } from '../../services/api';
import { realtimeSimulator } from './realtimeSimulator';

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

// Bus low-poly capsule dimensions (meters)
const BUS_LENGTH_M = 14;
const BUS_WIDTH_M = 4.2;
const BUS_HEIGHT_M = 3.2;

const CAP_SEGMENTS = 6;
const METERS_PER_DEGREE_LAT = 111320;

export interface LiveVehicleProps {
  trip_id: string;
  route_short_name: string;
  route_long_name?: string;
  mode?: 'train' | 'tram' | 'bus';
  color: string;
  bearing_deg: number;
  speed_kmh?: number;
  progress?: number;
  path?: [number, number][];
  status?: string;
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
  animStart: number;
  isSimulated?: boolean;
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
  private running = false;
  private trackedTripId: string | null = null;
  private onTrackVehicleHandler: ((e: Event) => void) | null = null;
  private onClearRouteHandler: (() => void) | null = null;
  private lastBroadcastTime = 0;

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
      this.render();
    }
  }

  /** Starts polling live vehicle positions and animating them on the map. */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Immediately load active simulated vehicles if simulator is ready
    this.loadFromSimulator();

    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.tick();
  }

  private loadFromSimulator(): void {
    const states = realtimeSimulator.getContinuousStates(Date.now() / 1000);
    if (!states || states.length === 0) return;

    for (const state of states) {
      if (!this.vehicles.has(state.tripId)) {
        const { segmentDistances, totalDistance } = computePathDistances(state.path);
        this.vehicles.set(state.tripId, {
          props: {
            trip_id: state.tripId,
            route_short_name: state.routeShortName,
            route_long_name: state.routeLongName,
            mode: state.mode,
            color: state.color,
            bearing_deg: state.bearing,
            speed_kmh: state.speedKmh,
            progress: state.progress,
            path: state.path,
            status: state.status,
            destination: state.destination,
            direction_id: state.directionId,
            is_stopped: state.isStopped
          },
          path: state.path,
          segmentDistances,
          totalDistance,
          lastKnownBearing: state.bearing,
          animStart: performance.now(),
          isSimulated: true
        });
      }
    }
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

    if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
      try {
        const fallback = await motionApi.getLiveTrains();
        if (fallback && fallback.features && fallback.features.length > 0) {
          featureCollection = fallback;
        }
      } catch {
        // preserve current vehicles
      }
    }

    const seenTripIds = new Set<string>();
    const isSimulatedFeed = (featureCollection as any)?.telemetry?.ptv_feed === 'realtime_simulation';

    for (const feature of (featureCollection?.features || [])) {
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
        if (props.is_stopped) {
          path = [[lon, lat], [lon, lat]];
        } else {
          // Dead-reckoning forward projection along heading so vehicle glides continuously
          const speedKmh = props.speed_kmh || 45;
          const distM = (speedKmh / 3.6) * (POLL_INTERVAL_MS / 1000);
          const bearingRad = ((props.bearing_deg || 0) * Math.PI) / 180;
          const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
          const nextLon = lon + (distM * Math.sin(bearingRad)) / metersPerDegreeLon;
          const nextLat = lat + (distM * Math.cos(bearingRad)) / METERS_PER_DEGREE_LAT;
          path = [[lon, lat], [nextLon, nextLat]];
        }
      }

      const { segmentDistances, totalDistance } = computePathDistances(path);

      this.vehicles.set(props.trip_id, {
        props,
        path,
        segmentDistances,
        totalDistance,
        lastKnownBearing: props.bearing_deg || 0,
        animStart: performance.now(),
        isSimulated: isSimulatedFeed
      });
    }

    if (seenTripIds.size > 0) {
      // Drop vehicles that have finished their trip
      for (const tripId of this.vehicles.keys()) {
        if (!seenTripIds.has(tripId)) this.vehicles.delete(tripId);
      }
    }

    // Broadcast current snapshot immediately on poll completion
    this.broadcastVehiclesUpdate();
  }

  private broadcastVehiclesUpdate(): void {
    if (typeof window === 'undefined') return;

    const vehiclesList: any[] = [];
    const countsByRoute: Record<string, number> = {};
    const nowSecs = Date.now() / 1000;
    const simStates = realtimeSimulator.isReady()
      ? new Map(realtimeSimulator.getContinuousStates(nowSecs).map((s) => [s.tripId, s]))
      : null;

    for (const vehicle of this.vehicles.values()) {
      const rName = vehicle.props.route_short_name;
      if (rName) {
        countsByRoute[rName] = (countsByRoute[rName] || 0) + 1;
      }

      const simState = simStates?.get(vehicle.props.trip_id);
      let lat = vehicle.path[0]?.[1] ?? 0;
      let lon = vehicle.path[0]?.[0] ?? 0;
      let bearing = vehicle.lastKnownBearing;
      let isStopped = vehicle.props.is_stopped ?? false;
      let status = vehicle.props.status ?? 'in_transit';
      let progress = vehicle.props.progress ?? 0;

      if (simState) {
        lat = simState.coords[1];
        lon = simState.coords[0];
        bearing = simState.bearing;
        isStopped = simState.isStopped;
        status = simState.status;
        progress = simState.progress;
      }

      vehiclesList.push({
        trip_id: vehicle.props.trip_id,
        route_short_name: vehicle.props.route_short_name,
        route_long_name: vehicle.props.route_long_name,
        mode: vehicle.props.mode || 'train',
        color: vehicle.props.color,
        lat,
        lon,
        bearing_deg: bearing,
        status,
        destination: vehicle.props.destination,
        is_stopped: isStopped,
        progress,
        from_stop_id: vehicle.props.from_stop_id,
        to_stop_id: vehicle.props.to_stop_id,
        from_stop_name: vehicle.props.from_stop_name,
        to_stop_name: vehicle.props.to_stop_name,
        current_stop_id: vehicle.props.current_stop_id,
        current_stop_name: vehicle.props.current_stop_name,
        direction_id: vehicle.props.direction_id,
      });
    }

    if (vehiclesList.length > 0) {
      window.dispatchEvent(
        new CustomEvent('motion:vehicles-updated', {
          detail: {
            vehicles: vehiclesList,
            countsByRoute,
            timestamp: Date.now(),
          },
        })
      );
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    this.render();

    const now = performance.now();
    // Dispatch real-time station & vehicle telemetry updates every 1200ms
    if (now - this.lastBroadcastTime > 1200) {
      this.lastBroadcastTime = now;
      this.broadcastVehiclesUpdate();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    const source = this.map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const nowSecs = Date.now() / 1000;
    const nowMs = performance.now();
    const features: GeoJSON.Feature[] = [];

    const simStates = realtimeSimulator.isReady()
      ? new Map(realtimeSimulator.getContinuousStates(nowSecs).map((s) => [s.tripId, s]))
      : null;

    for (const vehicle of this.vehicles.values()) {
      const isTram = vehicle.props.mode === 'tram';
      const isBus = vehicle.props.mode === 'bus';
      const lengthM = isBus ? BUS_LENGTH_M : isTram ? TRAM_LENGTH_M : TRAIN_LENGTH_M;
      const widthM = isBus ? BUS_WIDTH_M : isTram ? TRAM_WIDTH_M : TRAIN_WIDTH_M;
      const heightM = isBus ? BUS_HEIGHT_M : isTram ? TRAM_HEIGHT_M : TRAIN_HEIGHT_M;

      let coords: [number, number];
      let bearing: number;
      let isStopped = vehicle.props.is_stopped ?? false;
      let progress = vehicle.props.progress ?? 0;
      let status = vehicle.props.status ?? 'in_transit';

      const simState = simStates?.get(vehicle.props.trip_id);
      if (simState) {
        // High-precision continuous 60 FPS trajectory evaluation along actual Melbourne track geometry
        coords = simState.coords;
        bearing = simState.bearing;
        isStopped = simState.isStopped;
        progress = simState.progress;
        status = simState.status;
        vehicle.lastKnownBearing = bearing;
      } else {
        // Live GTFS-R feed interpolation + forward dead-reckoning projection
        const elapsed = nowMs - vehicle.animStart;
        const t = elapsed / POLL_INTERVAL_MS;

        if (t <= 1.0) {
          const res = pointAndBearingAlongPath(
            vehicle.path,
            vehicle.segmentDistances,
            vehicle.totalDistance,
            vehicle.lastKnownBearing,
            t
          );
          coords = res.coords;
          bearing = res.bearing;
          vehicle.lastKnownBearing = bearing;
        } else {
          // Dead-reckon forward along heading rather than stopping dead while waiting for next packet
          const overtimeSecs = (elapsed - POLL_INTERVAL_MS) / 1000;
          const speedKmh = vehicle.props.speed_kmh || (isTram ? 25 : 55);
          const distM = (speedKmh / 3.6) * overtimeSecs;
          const bearingRad = (vehicle.lastKnownBearing * Math.PI) / 180;
          const lastPt = vehicle.path[vehicle.path.length - 1];
          const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((lastPt[1] * Math.PI) / 180);
          coords = [
            lastPt[0] + (distM * Math.sin(bearingRad)) / metersPerDegreeLon,
            lastPt[1] + (distM * Math.cos(bearingRad)) / METERS_PER_DEGREE_LAT
          ];
          bearing = vehicle.lastKnownBearing;
        }
      }

      if (this.trackedTripId && vehicle.props.trip_id === this.trackedTripId) {
        if (!this.map.isMoving() || this.map.isEasing()) {
          this.map.easeTo({
            center: coords,
            bearing,
            pitch: 65,
            duration: 80,
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
          status,
          is_stopped: isStopped,
          progress
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
