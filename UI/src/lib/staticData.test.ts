import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGIN = 'http://localhost:3000';

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('staticData', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getStops fetches /data/stops.json once and caches subsequent calls', async () => {
    const stopsFixture = [['S1', 'Stop One', -37.8, 144.9]];
    fetchMock.mockImplementation(() => jsonResponse(stopsFixture));

    const { getStops } = await import('./staticData');
    const first = await getStops(ORIGIN);
    const second = await getStops(ORIGIN);

    expect(first).toEqual(stopsFixture);
    expect(second).toBe(first); // same cached array reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${ORIGIN}/data/stops.json`);
  });

  it('getRoutes fetches /data/routes.json', async () => {
    const routesFixture = [['R1', 'Alamein', 'Alamein - City', 400]];
    fetchMock.mockImplementation(() => jsonResponse(routesFixture));

    const { getRoutes } = await import('./staticData');
    const result = await getRoutes(ORIGIN);

    expect(result).toEqual(routesFixture);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${ORIGIN}/data/routes.json`);
  });

  it('getVehicleSim caches per weekday independently', async () => {
    fetchMock.mockImplementation((url: URL) =>
      jsonResponse(
        String(url).includes('monday')
          ? { trips: ['T-monday'], segments: [[0, 1, 2, 3, 4, 5, 6, 7]] }
          : { trips: ['T-tuesday'], segments: [[0, 1, 2, 3, 4, 5, 6, 7]] }
      )
    );

    const { getVehicleSim } = await import('./staticData');
    const monday = await getVehicleSim(ORIGIN, 'monday');
    const tuesday = await getVehicleSim(ORIGIN, 'tuesday');
    const mondayAgain = await getVehicleSim(ORIGIN, 'monday');

    expect(monday.trips).toEqual(['T-monday']);
    expect(tuesday.trips).toEqual(['T-tuesday']);
    expect(mondayAgain).toBe(monday);
    expect(fetchMock).toHaveBeenCalledTimes(2); // not 3 - monday was cached
  });

  it('throws a descriptive error when a static asset fetch fails', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));

    const { getStops } = await import('./staticData');
    await expect(getStops(ORIGIN)).rejects.toThrow(/Static asset fetch failed \[404\]/);
  });

  it('weekdayNameFromIndex wraps and maps 0-6 to monday..sunday', async () => {
    const { weekdayNameFromIndex } = await import('./staticData');
    expect(weekdayNameFromIndex(0)).toBe('monday');
    expect(weekdayNameFromIndex(6)).toBe('sunday');
    expect(weekdayNameFromIndex(7)).toBe('monday'); // wraps
    expect(weekdayNameFromIndex(-1)).toBe('sunday'); // wraps negative
  });
});
