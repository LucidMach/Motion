import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LineFeatureCollection, ShapeData } from './staticData';
import type { RouteRow } from './staticData';

vi.mock('./staticData', () => ({
  getMetroTrainsGeoJSON: vi.fn(),
  getRoutes: vi.fn(),
  getShapeData: vi.fn(),
  DEFAULT_TRAM_COLOR: '#78BE20',
}));

import { getMetroTrainsGeoJSON, getRoutes, getShapeData } from './staticData';
import { getRoutesForMode } from './routesForMode';

const ORIGIN = 'http://localhost:3000';

function trainFeature(routeShortName: string, overrides: Record<string, unknown> = {}) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString', coordinates: [] },
    properties: {
      route_id: `id-${routeShortName}`,
      route_short_name: routeShortName,
      route_long_name: `${routeShortName} - City`,
      color: '#0072CE',
      line_group: 'City Loop Group',
      outline: false,
      shuttle: false,
      mode: 'Metro Train',
      ...overrides,
    },
  };
}

describe('getRoutesForMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array for bus (dataset excludes bus)', async () => {
    const result = await getRoutesForMode(ORIGIN, 'bus');
    expect(result).toEqual([]);
    expect(getMetroTrainsGeoJSON).not.toHaveBeenCalled();
  });

  it('returns an empty array for an unknown mode', async () => {
    expect(await getRoutesForMode(ORIGIN, 'ferry')).toEqual([]);
  });

  describe('train', () => {
    it('excludes lines on the exclusion list (e.g. City Circle)', async () => {
      vi.mocked(getMetroTrainsGeoJSON).mockResolvedValue({
        type: 'FeatureCollection',
        features: [trainFeature('Pakenham'), trainFeature('City Circle')],
      } as LineFeatureCollection);

      const result = await getRoutesForMode(ORIGIN, 'train');
      expect(result.map((r) => r.route_short_name)).toEqual(['Pakenham']);
    });

    it('deduplicates multiple shape features for the same route', async () => {
      vi.mocked(getMetroTrainsGeoJSON).mockResolvedValue({
        type: 'FeatureCollection',
        features: [trainFeature('Pakenham'), trainFeature('Pakenham')],
      } as LineFeatureCollection);

      const result = await getRoutesForMode(ORIGIN, 'train');
      expect(result).toHaveLength(1);
    });

    it('sorts by the standard PTV corridor order, unlisted lines last alphabetically', async () => {
      vi.mocked(getMetroTrainsGeoJSON).mockResolvedValue({
        type: 'FeatureCollection',
        features: [
          trainFeature('Zzz Unlisted Line'),
          trainFeature('Sunbury'),
          trainFeature('Cranbourne'),
        ],
      } as LineFeatureCollection);

      const result = await getRoutesForMode(ORIGIN, 'train');
      // Cranbourne and Sunbury are both in TRAIN_CORRIDOR_ORDER (Cranbourne first);
      // the unlisted line sorts after every known line.
      expect(result.map((r) => r.route_short_name)).toEqual(['Cranbourne', 'Sunbury', 'Zzz Unlisted Line']);
    });

    it('passes through the already-resolved color/group/outline/shuttle from the static GeoJSON', async () => {
      vi.mocked(getMetroTrainsGeoJSON).mockResolvedValue({
        type: 'FeatureCollection',
        features: [trainFeature('Frankston', { color: '#028430', line_group: 'Frankston Line' })],
      } as LineFeatureCollection);

      const result = await getRoutesForMode(ORIGIN, 'train');
      expect(result[0]).toMatchObject({ color: '#028430', group: 'Frankston Line', mode: 'Metro Train' });
    });
  });

  describe('tram', () => {
    const tramRoutes: RouteRow[] = [
      ['3', '3', 'East Malvern - Melbourne University', 0],
      ['11', '11', 'Victoria Harbour Docklands - West Preston', 0],
      ['96', '96', 'St Kilda Beach - East Brunswick', 0],
      ['train-route', 'Pakenham', 'Pakenham - City', 400], // wrong route_type, must be excluded
      ['empty', '', 'Blank short name', 0], // empty short name, must be excluded
    ];

    beforeEach(() => {
      vi.mocked(getRoutes).mockResolvedValue(tramRoutes);
      vi.mocked(getShapeData).mockResolvedValue({
        tripShapeMap: new Map(),
        shapePolylines: new Map(),
        routeColors: new Map([['3', '#8DC8E8']]),
      } as ShapeData);
    });

    it('filters to route_type 0 with a non-empty short name', async () => {
      const result = await getRoutesForMode(ORIGIN, 'tram');
      expect(result.map((r) => r.route_short_name).sort()).toEqual(['11', '3', '96']);
    });

    it('sorts numerically rather than lexically (3 before 11 before 96)', async () => {
      const result = await getRoutesForMode(ORIGIN, 'tram');
      expect(result.map((r) => r.route_short_name)).toEqual(['3', '11', '96']);
    });

    it('uses the shape-data color when available, falling back to tram green otherwise', async () => {
      const result = await getRoutesForMode(ORIGIN, 'tram');
      expect(result.find((r) => r.route_short_name === '3')!.color).toBe('#8DC8E8');
      expect(result.find((r) => r.route_short_name === '11')!.color).toBe('#78BE20');
    });
  });
});
