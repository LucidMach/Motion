import { describe, it, expect } from 'vitest';
import { findLandmark, searchLandmarks, LANDMARKS } from './landmarks';

describe('findLandmark', () => {
  it('matches a landmark by its primary name', () => {
    const result = findLandmark('Monash University');
    expect(result).not.toBeNull();
    expect(result!.names[0]).toBe('monash university');
  });

  it('matches a landmark by an alias', () => {
    const result = findLandmark('rmit');
    expect(result).not.toBeNull();
    expect(result!.names).toContain('rmit');
  });

  it('matches case-insensitively and with surrounding whitespace', () => {
    expect(findLandmark('  THE SPOT  ')).not.toBeNull();
  });

  it('matches substrings either direction', () => {
    // Query is a substring of the landmark name.
    expect(findLandmark('finkel')).not.toBeNull();
    // Landmark name is a substring of a longer query.
    expect(findLandmark('monash university clayton campus visit')).not.toBeNull();
  });

  it('returns null for no match', () => {
    expect(findLandmark('some random street address')).toBeNull();
  });
});

describe('searchLandmarks', () => {
  it('returns every landmark whose name contains the query', () => {
    const results = searchLandmarks('crown');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((lm) => lm.names.some((n) => n.includes('crown')))).toBe(true);
  });

  it('returns an empty array for no matches', () => {
    expect(searchLandmarks('nonexistent place xyz')).toEqual([]);
  });

  it('every curated landmark has valid coordinates within Victoria', () => {
    for (const lm of LANDMARKS) {
      expect(lm.lat).toBeLessThan(-37);
      expect(lm.lat).toBeGreaterThan(-39);
      expect(lm.lon).toBeGreaterThan(144);
      expect(lm.lon).toBeLessThan(146);
    }
  });
});
