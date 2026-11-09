import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('searchPlaces', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('queries Nominatim scoped to Victoria/Australia', async () => {
    fetchMock.mockImplementation(() => jsonResponse([{ lat: '-37.8', lon: '144.9' }]));
    const { searchPlaces } = await import('./nominatim');

    const promise = searchPlaces('Flinders Street', 5);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toEqual([{ lat: '-37.8', lon: '144.9' }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('countrycodes=au');
    expect(url).toContain('q=Flinders%20Street');
  });

  it('returns an empty array instead of throwing on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const { searchPlaces } = await import('./nominatim');

    const promise = searchPlaces('anything', 5);
    await vi.runAllTimersAsync();
    expect(await promise).toEqual([]);
  });

  it('returns an empty array for a non-OK HTTP response', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }));
    const { searchPlaces } = await import('./nominatim');

    const promise = searchPlaces('anything', 5);
    await vi.runAllTimersAsync();
    expect(await promise).toEqual([]);
  });

  it('caches identical (query, limit) pairs without a second fetch', async () => {
    fetchMock.mockImplementation(() => jsonResponse([{ lat: '1', lon: '2' }]));
    const { searchPlaces } = await import('./nominatim');

    const p1 = searchPlaces('Richmond', 5);
    await vi.runAllTimersAsync();
    await p1;

    const p2 = searchPlaces('Richmond', 5);
    await vi.runAllTimersAsync();
    await p2;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throttles consecutive distinct requests to at least 1 second apart', async () => {
    fetchMock.mockImplementation(() => jsonResponse([]));
    const { searchPlaces } = await import('./nominatim');

    const start = Date.now();
    const p1 = searchPlaces('Richmond', 5);
    await vi.runAllTimersAsync();
    await p1;
    const firstCallAt = Date.now();

    const p2 = searchPlaces('Footscray', 5); // distinct query - must not hit cache
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still throttled just before 1s
    await vi.advanceTimersByTimeAsync(2);
    await p2;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstCallAt - start).toBeLessThan(50); // first request isn't throttled
  });
});
