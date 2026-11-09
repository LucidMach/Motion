// Melbourne wall-clock time helpers, ported from ptv_realtime.py's
// melbourne_now()/melbourne_naive_to_epoch(). GTFS calendar.txt dates and
// stop_times seconds-past-midnight are always naive Melbourne local time,
// regardless of what timezone the server process runs in.

const MELBOURNE_TZ = 'Australia/Melbourne';

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/** GTFS calendar.txt weekday column order, indexed Mon=0..Sun=6. */
export const WEEKDAY_COLUMNS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

export interface MelbourneMoment {
  /** YYYYMMDD, matching GTFS calendar.txt/calendar_dates.txt date format. */
  dateStr: string;
  /** Mon=0 .. Sun=6, matching Python's datetime.weekday(). */
  weekdayIndex: number;
  secondsSinceMidnight: number;
}

/** Current Melbourne wall-clock time. */
export function getMelbourneNow(): MelbourneMoment {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });

  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }

  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return {
    dateStr: `${parts.year}${parts.month}${parts.day}`,
    weekdayIndex: WEEKDAY_TO_INDEX[parts.weekday] ?? 0,
    secondsSinceMidnight: hour * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

/**
 * Same wall-clock time as `moment`, but one calendar day earlier - calendar
 * arithmetic (matching Python's naive `datetime - timedelta(days=1)`), not
 * real-elapsed-time subtraction, so it's unaffected by DST transitions.
 * `secondsSinceMidnight` gets +86400 added, matching the "trip from
 * yesterday's service day that's still running past midnight" candidate in
 * get_active_vehicle_positions().
 */
export function oneServiceDayEarlier(moment: MelbourneMoment): MelbourneMoment {
  const year = Number(moment.dateStr.slice(0, 4));
  const month = Number(moment.dateStr.slice(4, 6));
  const day = Number(moment.dateStr.slice(6, 8));

  // Noon UTC avoids any DST-adjacent date-rollover edge cases in pure
  // calendar math - we only use this Date object to shift the day field.
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  d.setUTCDate(d.getUTCDate() - 1);

  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');

  return {
    dateStr: `${yyyy}${mm}${dd}`,
    weekdayIndex: (moment.weekdayIndex + 6) % 7,
    secondsSinceMidnight: moment.secondsSinceMidnight + 86400,
  };
}
