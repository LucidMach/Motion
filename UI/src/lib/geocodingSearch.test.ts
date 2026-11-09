import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StopRow } from './staticData';
import type { NominatimPlace } from './nominatim';

vi.mock('./staticData', () => ({ getStops: vi.fn() }));
vi.mock('./nominatim', () => ({ searchPlaces: vi.fn() }));

import { getStops } from './staticData';
import { searchPlaces } from './nominatim';
import { search } from './geocodingSearch';

const ORIGIN = 'http://localhost:3000';

function mockStops(rows: StopRow[]) {
  vi.mocked(getStops).mockResolvedValue(rows);
}
function mockOsm(places: NominatimPlace[]) {
  vi.mocked(searchPlaces).mockResolvedValue(places);
}

describe('search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty array for a blank query without touching any data source', async () => {
    const result = await search(ORIGIN, '   ', 10);
    expect(result).toEqual([]);
    expect(getStops).not.toHaveBeenCalled();
  });

  it('ranks a curated landmark (tier 1) above a train station (tier 2) for the same query', async () => {
    mockStops([['11212', 'Flinders Street Station', -37.818, 144.966]]);
    mockOsm([]);

    // "RMIT" matches the curated landmark directly; no GTFS stop contains it.
    const results = await search(ORIGIN, 'rmit', 10);
    expect(results[0].mode).toBe('Campus / Landmark');
    expect(results[0].stop_name.toLowerCase()).toContain('rmit');
  });

  it('classifies GTFS stops by keyword into train/tram/bus', async () => {
    mockStops([
      ['S1', 'Richmond Railway Station', -37.82, 144.99],
      ['S2', 'Stop 7 - RMIT/Swanston St', -37.81, 144.96],
      ['S3', 'Monash University Bus Interchange', -37.91, 145.13],
    ]);
    mockOsm([]);

    const stationResult = await search(ORIGIN, 'richmond railway', 10);
    expect(stationResult[0].mode).toBe('Train Station');

    const busResult = await search(ORIGIN, 'bus interchange', 10);
    expect(busResult[0].mode).toBe('Bus Stop');
  });

  it('splits a "Stop X - Name/Street" GTFS display name into stop_name and street_name', async () => {
    mockStops([['T7', 'Stop 7 - RMIT/Swanston St', -37.81, 144.96]]);
    mockOsm([]);

    const results = await search(ORIGIN, 'Swanston', 10);
    const match = results.find((r) => r.stop_id === 'T7');
    expect(match).toBeDefined();
    expect(match!.stop_name).toBe('Stop 7 - RMIT');
    expect(match!.street_name).toBe('Swanston St');
  });

  it('deduplicates GTFS platforms of the same station by cleaned name', async () => {
    mockStops([
      ['A', 'Flinders Street Station', -37.818, 144.966],
      ['B', 'Flinders Street Railway Station', -37.8181, 144.9661],
    ]);
    mockOsm([]);

    const results = await search(ORIGIN, 'flinders street', 10);
    const flindersMatches = results.filter((r) => r.stop_name.toLowerCase().includes('flinders'));
    expect(flindersMatches).toHaveLength(1);
  });

  it('only queries OpenStreetMap when GTFS/landmark candidates are below the limit', async () => {
    mockStops([['S1', 'Richmond Station', -37.82, 144.99]]);
    mockOsm([]);

    await search(ORIGIN, 'richmond', 1); // candidates (1) already meets limit (1)
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('converts an OpenStreetMap result into a Place with a classified mode', async () => {
    mockStops([]);
    mockOsm([
      {
        lat: '-37.80',
        lon: '144.96',
        category: 'amenity',
        type: 'cafe',
        display_name: 'Some Cafe, 1 Example St, Melbourne',
        osm_type: 'node',
        osm_id: 123,
      },
    ]);

    const results = await search(ORIGIN, 'some cafe', 10);
    expect(results).toHaveLength(1);
    expect(results[0].mode).toBe('Building / Landmark');
    expect(results[0].stop_id).toBe('osm:node:123');
  });

  it('skips an OpenStreetMap result with non-numeric coordinates', async () => {
    mockStops([]);
    mockOsm([{ lat: 'not-a-number', lon: '144.96' }]);

    const results = await search(ORIGIN, 'broken result', 10);
    expect(results).toEqual([]);
  });

  it('respects the limit across combined candidate sources', async () => {
    mockStops([
      ['S1', 'Richmond Station', -37.82, 144.99],
      ['S2', 'Richmond Tram Stop', -37.821, 144.991],
      ['S3', 'Richmond Bus Stop', -37.822, 144.992],
    ]);
    mockOsm([]);

    const results = await search(ORIGIN, 'richmond', 2);
    expect(results).toHaveLength(2);
  });
});
