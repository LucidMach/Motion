import { describe, it, expect } from 'vitest';
import { getMelbourneNow, oneServiceDayEarlier, WEEKDAY_COLUMNS } from './melbourneTime';

describe('WEEKDAY_COLUMNS', () => {
  it('is the GTFS calendar.txt column order, Monday first', () => {
    expect(WEEKDAY_COLUMNS).toEqual([
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ]);
  });
});

describe('getMelbourneNow', () => {
  it('returns a self-consistent moment', () => {
    const moment = getMelbourneNow();
    expect(moment.dateStr).toMatch(/^\d{8}$/);
    expect(moment.weekdayIndex).toBeGreaterThanOrEqual(0);
    expect(moment.weekdayIndex).toBeLessThanOrEqual(6);
    expect(moment.secondsSinceMidnight).toBeGreaterThanOrEqual(0);
    expect(moment.secondsSinceMidnight).toBeLessThan(86400);
  });
});

describe('oneServiceDayEarlier', () => {
  it('steps the date back by exactly one calendar day', () => {
    const result = oneServiceDayEarlier({ dateStr: '20260115', weekdayIndex: 3, secondsSinceMidnight: 1000 });
    expect(result.dateStr).toBe('20260114');
  });

  it('rolls back across a month boundary', () => {
    const result = oneServiceDayEarlier({ dateStr: '20260301', weekdayIndex: 6, secondsSinceMidnight: 0 });
    expect(result.dateStr).toBe('20260228');
  });

  it('rolls back across a year boundary', () => {
    const result = oneServiceDayEarlier({ dateStr: '20260101', weekdayIndex: 3, secondsSinceMidnight: 0 });
    expect(result.dateStr).toBe('20251231');
  });

  it('decrements weekdayIndex by one, wrapping Monday to Sunday', () => {
    expect(oneServiceDayEarlier({ dateStr: '20260302', weekdayIndex: 0, secondsSinceMidnight: 0 }).weekdayIndex).toBe(6);
    expect(oneServiceDayEarlier({ dateStr: '20260303', weekdayIndex: 2, secondsSinceMidnight: 0 }).weekdayIndex).toBe(1);
  });

  it('adds 86400 seconds to secondsSinceMidnight, matching the "still running past midnight" candidate', () => {
    const result = oneServiceDayEarlier({ dateStr: '20260115', weekdayIndex: 3, secondsSinceMidnight: 1800 });
    expect(result.secondsSinceMidnight).toBe(1800 + 86400);
  });
});
