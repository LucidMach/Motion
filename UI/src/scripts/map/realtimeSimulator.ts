// Client-Side Real-Time Transit Simulation Engine
// Provides physically accurate, continuous 60 FPS real-time moving transit vehicles
// along Melbourne's rail and tram network shapes.

import type { LiveVehicle } from '../../services/api';

const METERS_PER_DEGREE_LAT = 111320;

function segmentDistanceMeters(a: [number, number], b: [number, number]): number {
  const avgLatRad = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEGREE_LAT * Math.cos(avgLatRad);
  const dx = (b[0] - a[0]) * metersPerDegLon;
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

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

function pointAndBearingAlongPath(
  path: [number, number][],
  segmentDistances: number[],
  totalDistance: number,
  fraction: number
): { coords: [number, number]; bearing: number } {
  if (path.length === 0) return { coords: [144.967, -37.818], bearing: 0 };
  if (path.length === 1 || totalDistance < 0.001) return { coords: path[0], bearing: 0 };

  const targetDist = Math.max(0, Math.min(totalDistance, fraction * totalDistance));
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    const segDist = segmentDistances[i];
    if (targetDist <= accumulated + segDist || i === segmentDistances.length - 1) {
      const segT = segDist > 0 ? (targetDist - accumulated) / segDist : 0;
      const clamped = Math.max(0, Math.min(1, segT));
      const a = path[i];
      const b = path[i + 1];
      const lon = a[0] + (b[0] - a[0]) * clamped;
      const lat = a[1] + (b[1] - a[1]) * clamped;

      let bearing = 0;
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

  return { coords: path[path.length - 1], bearing: 0 };
}

function slicePathBetweenFractions(
  path: [number, number][],
  segmentDistances: number[],
  totalDistance: number,
  startFrac: number,
  endFrac: number
): [number, number][] {
  if (path.length < 2) return path;

  const startPt = pointAndBearingAlongPath(path, segmentDistances, totalDistance, startFrac).coords;
  const endPt = pointAndBearingAlongPath(path, segmentDistances, totalDistance, endFrac).coords;

  const startDist = Math.max(0, Math.min(totalDistance, startFrac * totalDistance));
  const endDist = Math.max(0, Math.min(totalDistance, endFrac * totalDistance));

  const result: [number, number][] = [startPt];
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    accumulated += segmentDistances[i];
    if (accumulated > startDist && accumulated < endDist) {
      result.push(path[i + 1]);
    }
  }

  result.push(endPt);
  return result;
}

export interface SimVehicleConfig {
  tripId: string;
  routeShortName: string;
  routeLongName: string;
  mode: 'train' | 'tram';
  color: string;
  terminusA: string;
  terminusB: string;
  speedKmh: number;
  timeOffsetSecs: number;
}

export interface RealtimeVehicleState {
  tripId: string;
  routeShortName: string;
  routeLongName: string;
  mode: 'train' | 'tram';
  color: string;
  coords: [number, number];
  bearing: number;
  speedKmh: number;
  isStopped: boolean;
  status: 'dwelling' | 'in_transit';
  destination: string;
  directionId: number;
  progress: number;
  path: [number, number][];
}

// Complete fleet configuration covering all Melbourne train lines and key tram routes
export const SIM_CONFIGS: SimVehicleConfig[] = [
  // Metro Train Lines
  { tripId: 'SIM-TR-LIL-1', routeShortName: 'Lilydale', routeLongName: 'Flinders Street - Lilydale', mode: 'train', color: '#152C6B', terminusA: 'Flinders Street', terminusB: 'Lilydale', speedKmh: 58, timeOffsetSecs: 0 },
  { tripId: 'SIM-TR-LIL-2', routeShortName: 'Lilydale', routeLongName: 'Flinders Street - Lilydale', mode: 'train', color: '#152C6B', terminusA: 'Flinders Street', terminusB: 'Lilydale', speedKmh: 58, timeOffsetSecs: 900 },
  { tripId: 'SIM-TR-PKM-1', routeShortName: 'Pakenham', routeLongName: 'Flinders Street - Pakenham', mode: 'train', color: '#0072CE', terminusA: 'Flinders Street', terminusB: 'Pakenham', speedKmh: 62, timeOffsetSecs: 300 },
  { tripId: 'SIM-TR-PKM-2', routeShortName: 'Pakenham', routeLongName: 'Flinders Street - Pakenham', mode: 'train', color: '#0072CE', terminusA: 'Flinders Street', terminusB: 'Pakenham', speedKmh: 62, timeOffsetSecs: 1200 },
  { tripId: 'SIM-TR-CBE-1', routeShortName: 'Cranbourne', routeLongName: 'Flinders Street - Cranbourne', mode: 'train', color: '#0072CE', terminusA: 'Flinders Street', terminusB: 'Cranbourne', speedKmh: 60, timeOffsetSecs: 600 },
  { tripId: 'SIM-TR-BEL-1', routeShortName: 'Belgrave', routeLongName: 'Flinders Street - Belgrave', mode: 'train', color: '#152C6B', terminusA: 'Flinders Street', terminusB: 'Belgrave', speedKmh: 56, timeOffsetSecs: 450 },
  { tripId: 'SIM-TR-FKN-1', routeShortName: 'Frankston', routeLongName: 'Flinders Street - Frankston', mode: 'train', color: '#028430', terminusA: 'Flinders Street', terminusB: 'Frankston', speedKmh: 55, timeOffsetSecs: 150 },
  { tripId: 'SIM-TR-FKN-2', routeShortName: 'Frankston', routeLongName: 'Flinders Street - Frankston', mode: 'train', color: '#028430', terminusA: 'Flinders Street', terminusB: 'Frankston', speedKmh: 55, timeOffsetSecs: 1050 },
  { tripId: 'SIM-TR-GLW-1', routeShortName: 'Glen Waverley', routeLongName: 'Flinders Street - Glen Waverley', mode: 'train', color: '#152C6B', terminusA: 'Flinders Street', terminusB: 'Glen Waverley', speedKmh: 52, timeOffsetSecs: 200 },
  { tripId: 'SIM-TR-SND-1', routeShortName: 'Sandringham', routeLongName: 'Flinders Street - Sandringham', mode: 'train', color: '#F178AF', terminusA: 'Flinders Street', terminusB: 'Sandringham', speedKmh: 50, timeOffsetSecs: 350 },
  { tripId: 'SIM-TR-SBY-1', routeShortName: 'Sunbury', routeLongName: 'Flinders Street - Sunbury', mode: 'train', color: '#FFBE00', terminusA: 'Flinders Street', terminusB: 'Sunbury', speedKmh: 64, timeOffsetSecs: 500 },
  { tripId: 'SIM-TR-CRB-1', routeShortName: 'Craigieburn', routeLongName: 'Flinders Street - Craigieburn', mode: 'train', color: '#FFBE00', terminusA: 'Flinders Street', terminusB: 'Craigieburn', speedKmh: 58, timeOffsetSecs: 700 },
  { tripId: 'SIM-TR-MRN-1', routeShortName: 'Mernda', routeLongName: 'Flinders Street - Mernda', mode: 'train', color: '#BE1014', terminusA: 'Flinders Street', terminusB: 'Mernda', speedKmh: 55, timeOffsetSecs: 250 },
  { tripId: 'SIM-TR-HBE-1', routeShortName: 'Hurstbridge', routeLongName: 'Flinders Street - Hurstbridge', mode: 'train', color: '#BE1014', terminusA: 'Flinders Street', terminusB: 'Hurstbridge', speedKmh: 54, timeOffsetSecs: 800 },
  { tripId: 'SIM-TR-WER-1', routeShortName: 'Werribee', routeLongName: 'Flinders Street - Werribee', mode: 'train', color: '#028430', terminusA: 'Flinders Street', terminusB: 'Werribee', speedKmh: 62, timeOffsetSecs: 400 },
  { tripId: 'SIM-TR-WLM-1', routeShortName: 'Williamstown', routeLongName: 'Flinders Street - Williamstown', mode: 'train', color: '#028430', terminusA: 'Flinders Street', terminusB: 'Williamstown', speedKmh: 50, timeOffsetSecs: 650 },
  { tripId: 'SIM-TR-UFD-1', routeShortName: 'Upfield', routeLongName: 'Flinders Street - Upfield', mode: 'train', color: '#FFBE00', terminusA: 'Flinders Street', terminusB: 'Upfield', speedKmh: 48, timeOffsetSecs: 550 },
  { tripId: 'SIM-TR-ALM-1', routeShortName: 'Alamein', routeLongName: 'Flinders Street - Alamein', mode: 'train', color: '#152C6B', terminusA: 'Flinders Street', terminusB: 'Alamein', speedKmh: 48, timeOffsetSecs: 750 },

  // Key Yarra Tram Routes
  { tripId: 'SIM-TM-96-1', routeShortName: '96', routeLongName: 'East Brunswick - St Kilda Beach', mode: 'tram', color: '#C6007E', terminusA: 'East Brunswick', terminusB: 'St Kilda Beach', speedKmh: 28, timeOffsetSecs: 100 },
  { tripId: 'SIM-TM-96-2', routeShortName: '96', routeLongName: 'East Brunswick - St Kilda Beach', mode: 'tram', color: '#C6007E', terminusA: 'East Brunswick', terminusB: 'St Kilda Beach', speedKmh: 28, timeOffsetSecs: 550 },
  { tripId: 'SIM-TM-109-1', routeShortName: '109', routeLongName: 'Box Hill - Port Melbourne', mode: 'tram', color: '#E87722', terminusA: 'Box Hill', terminusB: 'Port Melbourne', speedKmh: 26, timeOffsetSecs: 200 },
  { tripId: 'SIM-TM-109-2', routeShortName: '109', routeLongName: 'Box Hill - Port Melbourne', mode: 'tram', color: '#E87722', terminusA: 'Box Hill', terminusB: 'Port Melbourne', speedKmh: 26, timeOffsetSecs: 800 },
  { tripId: 'SIM-TM-86-1', routeShortName: '86', routeLongName: 'Bundoora RMIT - Waterfront City Docklands', mode: 'tram', color: '#FFB500', terminusA: 'Bundoora RMIT', terminusB: 'Waterfront City Docklands', speedKmh: 27, timeOffsetSecs: 300 },
  { tripId: 'SIM-TM-19-1', routeShortName: '19', routeLongName: 'North Coburg - Flinders Street Station', mode: 'tram', color: '#8A1B61', terminusA: 'North Coburg', terminusB: 'Flinders Street Station', speedKmh: 24, timeOffsetSecs: 180 },
  { tripId: 'SIM-TM-75-1', routeShortName: '75', routeLongName: 'Vermont South - Central Pier Docklands', mode: 'tram', color: '#00A9E0', terminusA: 'Vermont South', terminusB: 'Central Pier Docklands', speedKmh: 26, timeOffsetSecs: 320 },
  { tripId: 'SIM-TM-48-1', routeShortName: '48', routeLongName: 'North Balwyn - Victoria Harbour Docklands', mode: 'tram', color: '#333434', terminusA: 'North Balwyn', terminusB: 'Victoria Harbour Docklands', speedKmh: 25, timeOffsetSecs: 420 },
  { tripId: 'SIM-TM-58-1', routeShortName: '58', routeLongName: 'West Coburg - Toorak', mode: 'tram', color: '#969696', terminusA: 'West Coburg', terminusB: 'Toorak', speedKmh: 25, timeOffsetSecs: 260 },
  { tripId: 'SIM-TM-70-1', routeShortName: '70', routeLongName: 'Wattle Park - Waterfront City Docklands', mode: 'tram', color: '#F59BBB', terminusA: 'Wattle Park', terminusB: 'Waterfront City Docklands', speedKmh: 25, timeOffsetSecs: 500 },
  { tripId: 'SIM-TM-11-1', routeShortName: '11', routeLongName: 'West Preston - Victoria Harbour Docklands', mode: 'tram', color: '#6ECEB2', terminusA: 'West Preston', terminusB: 'Victoria Harbour Docklands', speedKmh: 25, timeOffsetSecs: 140 },
  { tripId: 'SIM-TM-12-1', routeShortName: '12', routeLongName: 'Victoria Gardens - St Kilda', mode: 'tram', color: '#007E92', terminusA: 'Victoria Gardens', terminusB: 'St Kilda', speedKmh: 24, timeOffsetSecs: 380 },
  { tripId: 'SIM-TM-16-1', routeShortName: '16', routeLongName: 'Melbourne University - Kew', mode: 'tram', color: '#FBD872', terminusA: 'Melbourne University', terminusB: 'Kew', speedKmh: 25, timeOffsetSecs: 460 },
  { tripId: 'SIM-TM-59-1', routeShortName: '59', routeLongName: 'Airport West - Flinders Street Station', mode: 'tram', color: '#00653A', terminusA: 'Airport West', terminusB: 'Flinders Street Station', speedKmh: 27, timeOffsetSecs: 220 },
];

export interface LoadedRoute {
  forwardPath: [number, number][];
  forwardDists: number[];
  forwardTotalDist: number;
  reversePath: [number, number][];
  reverseDists: number[];
  reverseTotalDist: number;
}

export class RealtimeTransitSimulator {
  private routesMap = new Map<string, LoadedRoute>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        let res: Response;
        try {
          res = await fetch('/data/transit/canonical_route_shapes.json');
          if (!res.ok) throw new Error('canonical not found');
        } catch {
          res = await fetch('/data/transit/route_shapes.geojson');
        }

        if (res.ok) {
          const fc: GeoJSON.FeatureCollection = await res.json();
          for (const feat of fc.features || []) {
            const rName = feat.properties?.route_short_name;
            const geom = feat.geometry;
            if (rName && geom && geom.type === 'LineString') {
              const coords = geom.coordinates as [number, number][];
              if (coords.length >= 2 && !this.routesMap.has(rName)) {
                const { segmentDistances, totalDistance } = computePathDistances(coords);
                const revCoords = [...coords].reverse() as [number, number][];
                const revDistObj = computePathDistances(revCoords);
                this.routesMap.set(rName, {
                  forwardPath: coords,
                  forwardDists: segmentDistances,
                  forwardTotalDist: totalDistance,
                  reversePath: revCoords,
                  reverseDists: revDistObj.segmentDistances,
                  reverseTotalDist: revDistObj.totalDistance
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[RealtimeTransitSimulator] Notice loading shapes for simulation:', err);
      } finally {
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  isReady(): boolean {
    return this.initialized && this.routesMap.size > 0;
  }

  /**
   * Computes the exact, continuous mathematical position of a simulated vehicle
   * along its physical track polyline at any arbitrary timestamp.
   *
   * Formulated as a continuous distance function $D(t)$ with station dwelling
   * so motion is physically realistic with zero jumps or teleporting.
   */
  getVehicleStateAtTime(
    cfg: SimVehicleConfig,
    nowSecs: number = Date.now() / 1000,
    stepDurationSecs: number = 4
  ): RealtimeVehicleState | null {
    const route = this.routesMap.get(cfg.routeShortName);
    if (!route || route.forwardTotalDist < 100) return null;

    const speedMps = (cfg.speedKmh * 1000) / 3600;
    const runDurationSecs = 150;
    const dwellDurationSecs = 14;
    const cycleSecs = runDurationSecs + dwellDurationSecs;

    const t = nowSecs + cfg.timeOffsetSecs;
    const cycleIndex = Math.floor(t / cycleSecs);
    const timeInCycle = t - cycleIndex * cycleSecs;

    const isStopped = timeInCycle >= runDurationSecs;
    const runTimeInCycle = Math.min(timeInCycle, runDurationSecs);

    // Continuous monotonic distance traveled across all cycles (no discontinuities)
    const totalMetersTraveled = (cycleIndex * runDurationSecs + runTimeInCycle) * speedMps;

    // Round-trip distance
    const roundTripMeters = route.forwardTotalDist * 2;
    const positionInRoundTrip = ((totalMetersTraveled % roundTripMeters) + roundTripMeters) % roundTripMeters;

    const isOutbound = positionInRoundTrip < route.forwardTotalDist;
    const legMeters = isOutbound ? positionInRoundTrip : positionInRoundTrip - route.forwardTotalDist;

    const activePath = isOutbound ? route.forwardPath : route.reversePath;
    const activeDists = isOutbound ? route.forwardDists : route.reverseDists;
    const activeTotalDist = isOutbound ? route.forwardTotalDist : route.reverseTotalDist;

    const fraction = Math.max(0, Math.min(1, legMeters / activeTotalDist));
    const { coords, bearing } = pointAndBearingAlongPath(
      activePath,
      activeDists,
      activeTotalDist,
      fraction
    );

    const destination = isOutbound ? cfg.terminusB : cfg.terminusA;
    const directionId = isOutbound ? 0 : 1;

    // 4-second forward path slice for trajectory rendering
    const nextFraction = isStopped
      ? fraction
      : Math.max(0, Math.min(1, (legMeters + speedMps * stepDurationSecs) / activeTotalDist));

    const path = isStopped
      ? [coords, coords]
      : slicePathBetweenFractions(activePath, activeDists, activeTotalDist, fraction, nextFraction);

    return {
      tripId: cfg.tripId,
      routeShortName: cfg.routeShortName,
      routeLongName: cfg.routeLongName,
      mode: cfg.mode,
      color: cfg.color,
      coords,
      bearing,
      speedKmh: isStopped ? 0 : cfg.speedKmh,
      isStopped,
      status: isStopped ? 'dwelling' : 'in_transit',
      destination,
      directionId,
      progress: fraction,
      path
    };
  }

  /** Returns all active continuous vehicle states at the given timestamp */
  getContinuousStates(
    nowSecs: number = Date.now() / 1000,
    mode: 'all' | 'train' | 'tram' = 'all'
  ): RealtimeVehicleState[] {
    const activeConfigs = SIM_CONFIGS.filter((c) => mode === 'all' || c.mode === mode);
    const results: RealtimeVehicleState[] = [];

    for (const cfg of activeConfigs) {
      const state = this.getVehicleStateAtTime(cfg, nowSecs);
      if (state) results.push(state);
    }

    return results;
  }

  /** Returns synchronous FeatureCollection of active real-time vehicles */
  getLiveVehiclesSync(mode: 'all' | 'train' | 'tram' = 'all'): GeoJSON.FeatureCollection {
    if (!this.initialized && !this.initPromise && typeof window !== 'undefined') {
      this.init();
    }

    const states = this.getContinuousStates(Date.now() / 1000, mode);
    const features: GeoJSON.Feature[] = states.map((s) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: s.coords
      },
      properties: {
        trip_id: s.tripId,
        route_short_name: s.routeShortName,
        route_long_name: s.routeLongName,
        mode: s.mode,
        color: s.color,
        lat: s.coords[1],
        lon: s.coords[0],
        bearing_deg: s.bearing,
        speed_kmh: s.speedKmh,
        is_stopped: s.isStopped,
        status: s.status,
        destination: s.destination,
        direction_id: s.directionId,
        progress: s.progress,
        path: s.path
      }
    }));

    return {
      type: 'FeatureCollection',
      features,
      // @ts-ignore
      telemetry: {
        ptv_feed: 'realtime_simulation',
        vehicles_count: features.length,
        timestamp: Date.now()
      }
    };
  }

  /** Async interface matching API client expectations */
  async getLiveVehicles(mode: 'all' | 'train' | 'tram' = 'all'): Promise<GeoJSON.FeatureCollection> {
    if (!this.initialized) {
      await this.init();
    }
    return this.getLiveVehiclesSync(mode);
  }
}

export const realtimeSimulator = new RealtimeTransitSimulator();

// Proactively initiate shape preloading as soon as module is evaluated in the browser
if (typeof window !== 'undefined') {
  realtimeSimulator.init();
}
