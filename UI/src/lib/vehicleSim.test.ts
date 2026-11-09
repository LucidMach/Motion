import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SegmentRow, ShapeData, StopRow, RouteRow } from './staticData';

vi.mock('./melbourneTime', () => ({
  getMelbourneNow: vi.fn(),
  oneServiceDayEarlier: vi.fn(),
}));
vi.mock('./staticData', async () => {
  const actual = await vi.importActual<typeof import('./staticData')>('./staticData');
  return {
    weekdayNameFromIndex: actual.weekdayNameFromIndex,
    DEFAULT_TRAIN_COLOR: '#0072CE',
    DEFAULT_TRAM_COLOR: '#78BE20',
    getVehicleSim: vi.fn(),
    getShapeData: vi.fn(),
    getStops: vi.fn(),
    getRoutes: vi.fn(),
  };
});

import { getMelbourneNow, oneServiceDayEarlier } from './melbourneTime';
import { getVehicleSim, getShapeData, getStops, getRoutes } from './staticData';
import { getActiveVehiclePositions, cleanStationName, vehiclePositionsToGeoJSON } from './vehicleSim';

const ORIGIN = 'http://localhost:3000';
const TRAIN_ROUTE_TYPE = 400;
const TRAM_ROUTE_TYPE = 0;

const EMPTY_SHAPE_DATA: ShapeData = {
  tripShapeMap: new Map(),
  shapePolylines: new Map(),
  routeColors: new Map(),
};

/** A small fixture "world": stops/routes entity tables plus a builder for
 * index-based segment rows, mirroring precompute_static_data.py's output. */
function makeWorld() {
  const stops: StopRow[] = [];
  const routes: RouteRow[] = [];
  const trips: string[] = [];

  function stopIdx(id: string, name: string, lat: number, lon: number): number {
    let i = stops.findIndex((s) => s[0] === id);
    if (i === -1) {
      i = stops.length;
      stops.push([id, name, lat, lon]);
    }
    return i;
  }

  function routeIdx(id: string, shortName: string, longName: string, routeType: number): number {
    let i = routes.findIndex((r) => r[0] === id);
    if (i === -1) {
      i = routes.length;
      routes.push([id, shortName, longName, routeType]);
    }
    return i;
  }

  function tripIdx(tripId: string): number {
    let i = trips.indexOf(tripId);
    if (i === -1) {
      i = trips.length;
      trips.push(tripId);
    }
    return i;
  }

  function segment(overrides: Partial<{
    tripId: string; fromSecs: number; toSecs: number | null; nextDepSecs: number | null;
    fromStop: [string, string, number, number]; toStop: [string, string, number, number];
    route: [string, string, string, number];
    directionId: number | null;
  }> = {}): SegmentRow {
    const d = {
      tripId: 'T1', fromSecs: 1000, toSecs: 1100, nextDepSecs: 1100,
      fromStop: ['S1', 'Stop One Station', -37.80, 144.90] as [string, string, number, number],
      toStop: ['S2', 'Stop Two Station', -37.81, 144.91] as [string, string, number, number],
      route: ['R1', 'Pakenham', 'Pakenham - City', TRAIN_ROUTE_TYPE] as [string, string, string, number],
      directionId: 0,
      ...overrides,
    };
    return [
      tripIdx(d.tripId), d.fromSecs, d.toSecs, d.nextDepSecs,
      stopIdx(...d.fromStop), stopIdx(...d.toStop), routeIdx(...d.route), d.directionId,
    ];
  }

  return { stops, routes, trips, segment };
}

function setNow(weekdayIndex: number, secondsSinceMidnight: number) {
  vi.mocked(getMelbourneNow).mockReturnValue({ dateStr: '20260101', weekdayIndex, secondsSinceMidnight });
  vi.mocked(oneServiceDayEarlier).mockImplementation((m) => ({
    dateStr: '20251231',
    weekdayIndex: (m.weekdayIndex + 6) % 7,
    secondsSinceMidnight: m.secondsSinceMidnight + 86400,
  }));
}

describe('cleanStationName', () => {
  it('strips the "Railway Station" suffix', () => {
    expect(cleanStationName('Richmond Railway Station')).toBe('Richmond');
  });
  it('strips the plain "Station" suffix', () => {
    expect(cleanStationName('Flinders Street Station')).toBe('Flinders Street');
  });
  it('leaves names without a station suffix untouched', () => {
    expect(cleanStationName('Bourke St Mall')).toBe('Bourke St Mall');
  });
});

describe('getActiveVehiclePositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getShapeData).mockResolvedValue(EMPTY_SHAPE_DATA);
    vi.mocked(getVehicleSim).mockResolvedValue({ trips: [], segments: [] });
  });

  /** Wires getStops/getRoutes/getVehicleSim to one world's tables for every
   * weekday getActiveVehiclePositions might ask for (today + yesterday). */
  function wireWorld(world: ReturnType<typeof makeWorld>, segments: SegmentRow[]) {
    vi.mocked(getStops).mockResolvedValue(world.stops);
    vi.mocked(getRoutes).mockResolvedValue(world.routes);
    vi.mocked(getVehicleSim).mockImplementation(async () => ({ trips: world.trips, segments }));
  }

  it('computes in-transit progress proportional to elapsed time between stops', async () => {
    setNow(0, 1050); // halfway between fromSecs=1000 and toSecs=1100
    const world = makeWorld();
    wireWorld(world, [world.segment()]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(pos.status).toBe('in_transit');
    expect(pos.progress).toBeCloseTo(0.5, 2);
  });

  it('reports "dwelling" with progress 1 once a vehicle has arrived and is waiting to depart', async () => {
    setNow(0, 1120); // past toSecs (1100), before nextDepSecs (1150)
    const world = makeWorld();
    wireWorld(world, [world.segment({ toSecs: 1100, nextDepSecs: 1150 })]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(pos.status).toBe('dwelling');
    expect(pos.progress).toBe(1);
  });

  it('excludes segments outside the current time window', async () => {
    setNow(0, 5000); // long after this segment's window has closed
    const world = makeWorld();
    wireWorld(world, [world.segment({ fromSecs: 1000, toSecs: 1100, nextDepSecs: 1100 })]);

    const result = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(result).toEqual([]);
  });

  it('filters by mode via route_type', async () => {
    setNow(0, 1050);
    const world = makeWorld();
    const trainRoute: [string, string, string, number] = ['RT', 'Pakenham', 'Pakenham - City', TRAIN_ROUTE_TYPE];
    const tramRoute: [string, string, string, number] = ['RM', '96', '96 - City', TRAM_ROUTE_TYPE];
    wireWorld(world, [
      world.segment({ tripId: 'TRAIN1', route: trainRoute }),
      world.segment({ tripId: 'TRAM1', route: tramRoute }),
    ]);

    const trainsOnly = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(trainsOnly.map((p) => p.trip_id)).toEqual(['TRAIN1']);

    const tramsOnly = await getActiveVehiclePositions(ORIGIN, 'tram');
    expect(tramsOnly.map((p) => p.trip_id)).toEqual(['TRAM1']);

    const all = await getActiveVehiclePositions(ORIGIN, 'all');
    expect(all.map((p) => p.trip_id).sort()).toEqual(['TRAIN1', 'TRAM1']);
  });

  it('includes a trip from the previous service day still running past midnight', async () => {
    setNow(0, 300); // 00:05 today
    const world = makeWorld();
    vi.mocked(getStops).mockResolvedValue(world.stops);
    vi.mocked(getRoutes).mockResolvedValue(world.routes);

    const overnightSeg = world.segment({ tripId: 'OVERNIGHT', fromSecs: 86000, toSecs: 86700, nextDepSecs: 86700 });
    vi.mocked(getVehicleSim).mockImplementation(async (_origin, weekday) => {
      // Today's file has nothing active; yesterday's file (sunday, since
      // today is mocked as monday=index 0) has a trip whose window
      // (expressed in the +86400 "still running" frame) covers now.
      if (weekday === 'sunday') return { trips: world.trips, segments: [overnightSeg] };
      return { trips: [], segments: [] };
    });

    const result = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(result.map((p) => p.trip_id)).toEqual(['OVERNIGHT']);
  });

  it("resolves destination as the trip's final stop, not just the current bracketing segment", async () => {
    setNow(0, 1050);
    const world = makeWorld();
    wireWorld(world, [
      world.segment({
        tripId: 'T1', fromSecs: 1000, toSecs: 1100, nextDepSecs: 1100,
        toStop: ['SM', 'Middle Station', -37.80, 144.90],
      }),
      world.segment({
        tripId: 'T1', fromSecs: 1100, toSecs: 1200, nextDepSecs: 1200,
        fromStop: ['SM', 'Middle Station', -37.80, 144.90],
        toStop: ['SF', 'Final Terminus Station', -37.82, 144.92],
      }),
    ]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(pos.to_stop_name).toBe('Middle'); // current leg's destination
    expect(pos.destination).toBe('Final Terminus'); // trip's actual terminus
  });

  it('resolves tram/train color from shape data, falling back to the default per mode', async () => {
    setNow(0, 1050);
    const world = makeWorld();
    vi.mocked(getShapeData).mockResolvedValue({
      tripShapeMap: new Map(),
      shapePolylines: new Map(),
      routeColors: new Map([['Pakenham', '#0072CE'], ['96', '#C6007E']]),
    });
    wireWorld(world, [
      world.segment({ tripId: 'TRAIN1', route: ['RT', 'Pakenham', 'Pakenham - City', TRAIN_ROUTE_TYPE] }),
      world.segment({ tripId: 'TRAM1', route: ['RM', '96', '96 - City', TRAM_ROUTE_TYPE] }),
      world.segment({ tripId: 'TRAM2', route: ['RU', 'Unmapped', 'Unmapped - City', TRAM_ROUTE_TYPE] }),
    ]);

    const result = await getActiveVehiclePositions(ORIGIN, 'all');
    expect(result.find((p) => p.trip_id === 'TRAIN1')!.color).toBe('#0072CE');
    expect(result.find((p) => p.trip_id === 'TRAM1')!.color).toBe('#C6007E');
    expect(result.find((p) => p.trip_id === 'TRAM2')!.color).toBe('#78BE20'); // DEFAULT_TRAM_COLOR
  });

  it('falls back to straight-line interpolation when no track shape is available', async () => {
    setNow(0, 1050); // halfway
    const world = makeWorld();
    wireWorld(world, [
      world.segment({
        fromStop: ['S1', 'Start Station', -38.0, 144.0],
        toStop: ['S2', 'End Station', -37.0, 145.0],
        toSecs: 1100, nextDepSecs: 1100,
      }),
    ]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(pos.lat).toBeCloseTo(-37.5, 1);
    expect(pos.lon).toBeCloseTo(144.5, 1);
  });

  it('snaps position onto the track shape when one is available for the trip', async () => {
    setNow(0, 1050);
    const world = makeWorld();
    const polyline: [number, number][] = [[144.0, -38.0], [144.5, -37.5], [145.0, -37.0]];
    vi.mocked(getShapeData).mockResolvedValue({
      tripShapeMap: new Map([['T1', 'SHAPE_A']]),
      shapePolylines: new Map([['SHAPE_A', polyline]]),
      routeColors: new Map(),
    });
    wireWorld(world, [
      world.segment({
        tripId: 'T1',
        fromStop: ['S1', 'Start Station', -38.0, 144.0],
        toStop: ['S2', 'End Station', -37.0, 145.0],
        toSecs: 1100, nextDepSecs: 1100,
      }),
    ]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    // Snapped onto the polyline's own middle vertex rather than a straight
    // chord - should land very close to [144.5, -37.5].
    expect(pos.lon).toBeCloseTo(144.5, 1);
    expect(pos.lat).toBeCloseTo(-37.5, 1);
  });

  it('marks a vehicle as is_stopped near either end of a leg even while technically in_transit', async () => {
    setNow(0, 1002); // just after departure
    const world = makeWorld();
    wireWorld(world, [world.segment({ fromSecs: 1000, toSecs: 1100, nextDepSecs: 1100 })]);

    const [pos] = await getActiveVehiclePositions(ORIGIN, 'train');
    expect(pos.is_stopped).toBe(true);
  });
});

describe('vehiclePositionsToGeoJSON', () => {
  it('wraps positions into a Point FeatureCollection with the expected properties', async () => {
    vi.clearAllMocks();
    vi.mocked(getShapeData).mockResolvedValue(EMPTY_SHAPE_DATA);
    setNow(0, 1050);
    const world = makeWorld();
    vi.mocked(getStops).mockResolvedValue(world.stops);
    vi.mocked(getRoutes).mockResolvedValue(world.routes);
    const seg = world.segment();
    vi.mocked(getVehicleSim).mockImplementation(async () => ({ trips: world.trips, segments: [seg] }));

    const positions = await getActiveVehiclePositions(ORIGIN, 'train');

    const fc = vehiclePositionsToGeoJSON(positions);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].type).toBe('Feature');
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[0].geometry.coordinates).toEqual([positions[0].lon, positions[0].lat]);
    expect(fc.features[0].properties.trip_id).toBe(positions[0].trip_id);
  });
});
