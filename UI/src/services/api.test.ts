import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { motionApi } from './api';

describe('MotionApiClient Static & Live Transit Data', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    motionApi.clearStaticCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    motionApi.clearStaticCache();
  });

  it('loads routes from static /data/transit/routes.json when available', async () => {
    const mockRoutes = {
      train: [
        {
          route_id: 'R_LIL',
          route_short_name: 'Lilydale',
          route_long_name: 'Lilydale Line',
          color: '#152C6B',
          group: 'Burnley Group',
          mode: 'train',
        },
      ],
      tram: [],
      bus: [],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/data/transit/routes.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockRoutes,
        } as Response;
      }
      throw new Error(`Unexpected url: ${urlStr}`);
    });

    const routes = await motionApi.getRoutesByMode('train');
    expect(routes).toHaveLength(1);
    expect(routes[0].route_short_name).toBe('Lilydale');
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/data/transit/routes.json'));
  });

  it('loads route stops from static /data/transit/route_stops.json when available', async () => {
    const mockRouteStops = {
      'train:Lilydale': [
        {
          stop_id: '19854',
          stop_name: 'Flinders Street',
          full_name: 'Flinders Street Railway Station',
          stop_lat: -37.818,
          stop_lon: 144.967,
          stop_sequence: 1,
          is_interchange: true,
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/data/transit/route_stops.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockRouteStops,
        } as Response;
      }
      throw new Error(`Unexpected url: ${urlStr}`);
    });

    const stops = await motionApi.getRouteStops('train', 'Lilydale');
    expect(stops).toHaveLength(1);
    expect(stops[0].stop_name).toBe('Flinders Street');
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/data/transit/route_stops.json'));
  });

  it('falls back to backend API if static JSON fetch fails', async () => {
    const mockApiRoutes = [
      {
        route_id: 'R_BEL',
        route_short_name: 'Belgrave',
        route_long_name: 'Belgrave Line',
        color: '#152C6B',
        group: 'Burnley Group',
        mode: 'train',
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/data/transit/routes.json')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        } as Response;
      }
      if (urlStr.includes('/api/network/routes/train')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockApiRoutes,
        } as Response;
      }
      throw new Error(`Unexpected url: ${urlStr}`);
    });

    const routes = await motionApi.getRoutesByMode('train');
    expect(routes).toHaveLength(1);
    expect(routes[0].route_short_name).toBe('Belgrave');
  });
});
