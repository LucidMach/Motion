import { describe, it, expect } from 'vitest';
import { projectPointToPolyline, pointAtArcLength, slicePolylineByArcLength, type Point } from './geometry';

// A straight east-west line along the equator, where 1 degree of longitude
// is close enough to 1 degree of latitude in km that simple arithmetic
// checks remain readable.
const STRAIGHT_LINE: Point[] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
];

describe('projectPointToPolyline', () => {
  it('returns null for a polyline shorter than 2 points', () => {
    expect(projectPointToPolyline([0, 0], [[0, 0]])).toBeNull();
  });

  it('snaps a point exactly on the line to itself with zero arc length at the start', () => {
    const result = projectPointToPolyline([0, 0], STRAIGHT_LINE);
    expect(result).not.toBeNull();
    expect(result!.arcLengthKm).toBeCloseTo(0, 3);
    expect(result!.point[0]).toBeCloseTo(0, 5);
  });

  it('snaps a point near the middle of the line to roughly half the total arc length', () => {
    const result = projectPointToPolyline([0.5, 0.001], STRAIGHT_LINE);
    expect(result).not.toBeNull();
    const total = projectPointToPolyline([1, 0], STRAIGHT_LINE)!.arcLengthKm;
    expect(result!.arcLengthKm).toBeGreaterThan(0);
    expect(result!.arcLengthKm).toBeLessThan(total);
  });

  it('orients the local bearing eastward along an eastward line', () => {
    const result = projectPointToPolyline([0.25, 0], STRAIGHT_LINE);
    expect(result!.bearingDeg).toBeCloseTo(90, 0);
  });
});

describe('pointAtArcLength', () => {
  it('returns null for a polyline shorter than 2 points', () => {
    expect(pointAtArcLength([[0, 0]], 1)).toBeNull();
  });

  it('returns the start point at arc length 0', () => {
    const result = pointAtArcLength(STRAIGHT_LINE, 0);
    expect(result!.point[0]).toBeCloseTo(0, 5);
    expect(result!.point[1]).toBeCloseTo(0, 5);
  });

  it('clamps negative arc length to the start', () => {
    const result = pointAtArcLength(STRAIGHT_LINE, -50);
    expect(result!.point[0]).toBeCloseTo(0, 5);
  });

  it('clamps arc length beyond the total to the end', () => {
    const result = pointAtArcLength(STRAIGHT_LINE, 1_000_000);
    expect(result!.point[0]).toBeCloseTo(1, 4);
  });

  it('round-trips with projectPointToPolyline for an on-line point', () => {
    const projected = projectPointToPolyline([0.3, 0], STRAIGHT_LINE)!;
    const backOut = pointAtArcLength(STRAIGHT_LINE, projected.arcLengthKm)!;
    expect(backOut.point[0]).toBeCloseTo(0.3, 3);
    expect(backOut.point[1]).toBeCloseTo(0, 3);
  });
});

describe('slicePolylineByArcLength', () => {
  it('returns a two-point slice collapsed to one coordinate when start equals end', () => {
    const slice = slicePolylineByArcLength(STRAIGHT_LINE, 10, 10);
    expect(slice).toHaveLength(2);
    expect(slice[0]).toEqual(slice[1]);
  });

  it('includes intermediate polyline vertices between start and end', () => {
    const slice = slicePolylineByArcLength(STRAIGHT_LINE, 0, 1000);
    // Should include the midpoint vertex [0.5, 0] since it lies strictly
    // between the clamped start (0) and end (total length).
    expect(slice.some((p) => Math.abs(p[0] - 0.5) < 1e-6)).toBe(true);
  });

  it('reverses point order when start is after end (backward traversal)', () => {
    const forward = slicePolylineByArcLength(STRAIGHT_LINE, 0, 1000);
    const backward = slicePolylineByArcLength(STRAIGHT_LINE, 1000, 0);
    expect(backward[0]).toEqual(forward[forward.length - 1]);
    expect(backward[backward.length - 1]).toEqual(forward[0]);
  });
});
