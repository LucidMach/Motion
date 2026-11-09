import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RouteRow } from './staticData';
import type { DecodedAlert, DecodedFeed } from './gtfsRealtime';

vi.mock('./gtfsRealtime', () => ({ decodeFeedMessage: vi.fn() }));
vi.mock('./staticData', () => ({ getRoutes: vi.fn() }));

const ORIGIN = 'http://localhost:3000';

function okResponse(): Response {
  return new Response(new ArrayBuffer(8), { status: 200 });
}
function notFoundResponse(): Response {
  return new Response('not found', { status: 404 });
}

function decodedAlert(overrides: Partial<DecodedAlert> = {}): DecodedAlert {
  return {
    activePeriods: [],
    headerText: 'Header',
    descriptionText: 'Description',
    effect: 1,
    informedRouteIds: [],
    ...overrides,
  };
}

describe('disruptions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Only the first of the 4 SERVICE_ALERT_URLS succeeds, so decodeFeedMessage
  // (mocked) is exercised exactly once per getRawServiceAlerts() call.
  async function setupOneLiveFeed(alerts: DecodedAlert[], routes: RouteRow[] = []) {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValue(notFoundResponse());

    const { decodeFeedMessage } = await import('./gtfsRealtime');
    vi.mocked(decodeFeedMessage).mockReturnValue({ alerts } satisfies DecodedFeed);

    const { getRoutes } = await import('./staticData');
    vi.mocked(getRoutes).mockResolvedValue(routes);

    return import('./disruptions');
  }

  it('maps effect 3 to DELAYED and every other effect to NO_SERVICE', async () => {
    const { getRawServiceAlerts } = await setupOneLiveFeed([
      decodedAlert({ effect: 3 }),
      decodedAlert({ effect: 1 }),
      decodedAlert({ effect: 8 }),
    ]);

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts.map((a) => a.effect)).toEqual(['DELAYED', 'NO_SERVICE', 'NO_SERVICE']);
    expect(alerts[0].delay_mins).toBe(10.0);
    expect(alerts[1].delay_mins).toBe(0.0);
  });

  it('detects a replacement bus mention across the combined header+description text', async () => {
    const { getRawServiceAlerts } = await setupOneLiveFeed([
      decodedAlert({ headerText: 'Sandringham line', descriptionText: 'Buses replace trains today' }),
      decodedAlert({ headerText: 'Delay', descriptionText: 'No alternative transport' }),
    ]);

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts[0].replacement_bus_available).toBe(true);
    expect(alerts[1].replacement_bus_available).toBe(false);
  });

  it('resolves an informed_entity route_id to a route_short_name via static routes data', async () => {
    const routes: RouteRow[] = [['route-123', 'Sandringham', 'Sandringham - City', 400]];
    const { getRawServiceAlerts } = await setupOneLiveFeed(
      [decodedAlert({ informedRouteIds: ['route-123'] })],
      routes
    );

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts.map((a) => a.route_name)).toEqual(['Sandringham']);
  });

  it('falls back to known line names mentioned in the alert text when there is no informed_entity match', async () => {
    const { getRawServiceAlerts } = await setupOneLiveFeed([
      decodedAlert({ headerText: 'Frankston line disruption', informedRouteIds: [] }),
    ]);

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts.map((a) => a.route_name)).toEqual(['Frankston']);
  });

  it('defaults to "General Network" when no route can be matched at all', async () => {
    const { getRawServiceAlerts } = await setupOneLiveFeed([
      decodedAlert({ headerText: 'Unrelated announcement', informedRouteIds: [] }),
    ]);

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts.map((a) => a.route_name)).toEqual(['General Network']);
  });

  it('pushes one raw alert per matched route when an alert covers multiple routes', async () => {
    const routes: RouteRow[] = [
      ['r1', 'Sandringham', 'Sandringham - City', 400],
      ['r2', 'Werribee', 'Werribee - City', 400],
    ];
    const { getRawServiceAlerts } = await setupOneLiveFeed(
      [decodedAlert({ informedRouteIds: ['r1', 'r2'] })],
      routes
    );

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts.map((a) => a.route_name).sort()).toEqual(['Sandringham', 'Werribee']);
  });

  it('caches raw alerts for 60 seconds without re-fetching', async () => {
    const { getRawServiceAlerts } = await setupOneLiveFeed([decodedAlert()]);

    await getRawServiceAlerts(ORIGIN);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await getRawServiceAlerts(ORIGIN);

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no new fetches
  });

  it('skips a feed that returns a non-200 status without throwing', async () => {
    fetchMock.mockResolvedValue(notFoundResponse());
    const { decodeFeedMessage } = await import('./gtfsRealtime');
    const { getRoutes } = await import('./staticData');
    vi.mocked(getRoutes).mockResolvedValue([]);
    const { getRawServiceAlerts } = await import('./disruptions');

    const alerts = await getRawServiceAlerts(ORIGIN);
    expect(alerts).toEqual([]);
    expect(decodeFeedMessage).not.toHaveBeenCalled();
  });

  describe('fetchLiveServiceAlerts (active time window)', () => {
    const nowSecs = Math.floor(Date.now() / 1000);

    it('treats an alert with no active_periods as always active', async () => {
      const { fetchLiveServiceAlerts } = await setupOneLiveFeed([decodedAlert({ activePeriods: [] })]);
      expect(await fetchLiveServiceAlerts(ORIGIN, 60)).toHaveLength(1);
    });

    it('excludes an alert whose active_period starts in the future', async () => {
      const { fetchLiveServiceAlerts } = await setupOneLiveFeed([
        decodedAlert({ activePeriods: [{ start: nowSecs + 3600, end: nowSecs + 7200 }] }),
      ]);
      expect(await fetchLiveServiceAlerts(ORIGIN, 60)).toHaveLength(0);
    });

    it('excludes an alert that ended before the lookback window started', async () => {
      const { fetchLiveServiceAlerts } = await setupOneLiveFeed([
        decodedAlert({ activePeriods: [{ start: nowSecs - 10000, end: nowSecs - 9000 }] }), // ended ~2.5h ago
      ]);
      expect(await fetchLiveServiceAlerts(ORIGIN, 60)).toHaveLength(0); // 60 min lookback
    });

    it('includes an alert whose active_period overlaps the lookback window', async () => {
      const { fetchLiveServiceAlerts } = await setupOneLiveFeed([
        decodedAlert({ activePeriods: [{ start: nowSecs - 1000, end: nowSecs + 1000 }] }),
      ]);
      expect(await fetchLiveServiceAlerts(ORIGIN, 60)).toHaveLength(1);
    });

    it('includes an open-ended alert (end=0) that has already started', async () => {
      const { fetchLiveServiceAlerts } = await setupOneLiveFeed([
        decodedAlert({ activePeriods: [{ start: nowSecs - 1000, end: 0 }] }),
      ]);
      expect(await fetchLiveServiceAlerts(ORIGIN, 60)).toHaveLength(1);
    });
  });
});
