import { describe, it, expect } from 'vitest';
import { haversine, calculateBearing, walkingTimeMins, getModeName, WALKING_SPEED_KMH } from './geo';

describe('haversine', () => {
  it('computes ~111km per degree of latitude', () => {
    const dist = haversine(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it('returns 0 for identical points', () => {
    expect(haversine(-37.81, 144.96, -37.81, 144.96)).toBeCloseTo(0, 6);
  });
});

describe('calculateBearing', () => {
  it('points due north as 0 degrees', () => {
    expect(calculateBearing(0, 0, 1, 0)).toBeCloseTo(0, 0);
  });
  it('points due east as 90 degrees', () => {
    expect(calculateBearing(0, 0, 0, 1)).toBeCloseTo(90, 0);
  });
  it('points due south as 180 degrees', () => {
    expect(calculateBearing(1, 0, 0, 0)).toBeCloseTo(180, 0);
  });
  it('points due west as 270 degrees', () => {
    expect(calculateBearing(0, 1, 0, 0)).toBeCloseTo(270, 0);
  });
});

describe('walkingTimeMins', () => {
  it('converts distance to minutes at the standard walking speed', () => {
    // 5km at WALKING_SPEED_KMH (5 km/h) should take 60 minutes.
    expect(walkingTimeMins(5.0)).toBeCloseTo(60.0, 1);
    expect(WALKING_SPEED_KMH).toBe(5.0);
  });
  it('is zero for zero distance', () => {
    expect(walkingTimeMins(0)).toBe(0);
  });
});

describe('getModeName', () => {
  it('maps standard GTFS route types', () => {
    expect(getModeName(0)).toBe('Tram');
    expect(getModeName(1)).toBe('Train');
    expect(getModeName(2)).toBe('Train');
    expect(getModeName(3)).toBe('Bus');
    expect(getModeName(4)).toBe('Ferry');
    expect(getModeName(5)).toBe('Cable Tram');
    expect(getModeName(6)).toBe('Gondola');
    expect(getModeName(7)).toBe('Funicular');
  });

  it('maps extended Hierarchical Vehicle Type ranges', () => {
    expect(getModeName(900)).toBe('Tram');
    expect(getModeName(400)).toBe('Train');
    expect(getModeName(100)).toBe('Train');
    expect(getModeName(701)).toBe('Bus');
    expect(getModeName(1000)).toBe('Ferry');
  });

  it('falls back to Transit for null/unknown values', () => {
    expect(getModeName(null)).toBe('Transit');
    expect(getModeName(undefined)).toBe('Transit');
    expect(getModeName('not-a-number')).toBe('Transit');
    expect(getModeName(99999)).toBe('Transit');
  });

  it('accepts numeric strings', () => {
    expect(getModeName('400')).toBe('Train');
  });
});
