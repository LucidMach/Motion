"""
Bakes the GTFS SQLite database down into static JSON files consumed
directly by the Astro API routes under UI/src/pages/api/ - no database is
hosted at runtime. This is an offline/dev-only tool: run it locally
whenever the GTFS dataset is rebuilt (gtfs_db_builder.py), the same
regenerate-on-manual-rebuild workflow as the existing route-shape/metro-line
static files in UI/public/data/transit/.

Outputs:
  UI/public/data/stops.json              - [stop_id, stop_name, stop_lat, stop_lon][]
  UI/public/data/routes.json             - [route_id, route_short_name, route_long_name, route_type][]
  UI/public/data/vehicle-sim/<weekday>.json - one file per weekday (monday..sunday):
      {"trips": [trip_id, ...], "segments": [[...], ...]}
      `segments` covers every consecutive stop-to-stop hop of every
      train/tram trip active that day (see SEGMENT_COLUMNS below), for the
      live vehicle position endpoint to filter by current time at request
      time - no `now` filtering happens here, so one precompute run covers
      the whole day.

      Segment rows reference stops.json/routes.json by array *index*
      (fromStopIdx/toStopIdx/routeIdx) rather than duplicating stop
      names/coordinates or route names 100,000+ times over - stop/route
      identity is already deduplicated in those two files, which every
      weekday file would otherwise have been re-embedding a copy of. Only
      `trips` is per-weekday (trip sets differ by day), so segment rows
      reference it by index too (tripIdx). This keeps the largest weekday
      file under GitHub's size limits without changing anything about the
      underlying data - see commit history for the size before this.

Caveat accepted by design: active service_id is resolved against *today's*
calendar.txt/calendar_dates.txt exceptions at the moment this script runs,
not per-request. A GTFS timetable revision that crosses a calendar.txt
date-range boundary, or a calendar_dates.txt one-off exception (e.g. a
public holiday), won't be reflected until this script is re-run. That's a
deliberate tradeoff for having no live database - see
directional_routing.spec.md's sibling discussion in the migration plan.

Usage:
    python gtfs_db_builder/precompute_static_data.py
"""
import datetime
import json
import os
import sqlite3
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing import DB_NAME

OUT_DIR = os.path.join(PROJECT_ROOT, 'UI', 'public', 'data')
VEHICLE_SIM_DIR = os.path.join(OUT_DIR, 'vehicle-sim')

WEEKDAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

TRAIN_ROUTE_TYPE = 400
TRAM_ROUTE_TYPE = 0

# Column order baked into each vehicle-sim segment row (array-of-arrays, not
# array-of-objects, to avoid repeating field names across ~230k rows/day).
# fromStopIdx/toStopIdx index into stops.json; routeIdx indexes into
# routes.json; tripIdx indexes into this same file's own "trips" list.
# Everything else these rows used to carry directly (lat/lon, stop names,
# route names/type) is looked up from stops.json/routes.json instead.
SEGMENT_COLUMNS = [
    'trip_idx', 'from_secs', 'to_secs', 'next_dep_secs',
    'from_stop_idx', 'to_stop_idx', 'route_idx', 'direction_id',
]


def active_service_ids(cur, date_str, weekday_col):
    cur.execute(
        f"SELECT service_id FROM calendar WHERE start_date <= ? AND end_date >= ? AND {weekday_col} = 1",
        (date_str, date_str),
    )
    active = {row[0] for row in cur.fetchall()}

    cur.execute("SELECT service_id, exception_type FROM calendar_dates WHERE date = ?", (date_str,))
    for service_id, exception_type in cur.fetchall():
        if exception_type == 1:
            active.add(service_id)
        elif exception_type == 2:
            active.discard(service_id)

    return active


def bracketing_segments_for_day(cur, service_ids, route_types=(TRAIN_ROUTE_TYPE, TRAM_ROUTE_TYPE)):
    """Raw (trip_id, from_secs, to_secs, next_dep_secs, from_stop_id, to_stop_id, route_id, direction_id)
    rows - stop/route *identity* only, no names/coordinates (those are looked
    up from stops.json/routes.json by the caller, which turns these ids into
    indices)."""
    if not service_ids:
        return []

    placeholders = ','.join('?' for _ in service_ids)
    rt_placeholders = ','.join('?' for _ in route_types)
    query = f"""
        WITH selected_trips AS (
            SELECT trip_id FROM trips
            WHERE service_id IN ({placeholders})
              AND route_id IN (SELECT route_id FROM routes WHERE route_type IN ({rt_placeholders}))
        ),
        ordered AS (
            SELECT
                st.trip_id,
                st.stop_id AS from_stop_id,
                st.departure_time_secs AS from_secs,
                LEAD(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS to_stop_id,
                LEAD(st.arrival_time_secs) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS to_secs,
                LEAD(st.departure_time_secs) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS next_dep_secs
            FROM stop_times st
            WHERE st.trip_id IN (SELECT trip_id FROM selected_trips)
        )
        SELECT
            o.trip_id, o.from_secs, o.to_secs, o.next_dep_secs,
            o.from_stop_id, o.to_stop_id, r.route_id,
            t.direction_id
        FROM ordered o
        JOIN trips t ON t.trip_id = o.trip_id
        JOIN routes r ON r.route_id = t.route_id
        WHERE o.to_stop_id IS NOT NULL
          AND r.route_short_name != 'Replacement Bus'
        ORDER BY o.from_secs ASC
    """
    cur.execute(query, list(service_ids) + list(route_types))
    return cur.fetchall()


def next_occurrence_of_weekday(weekday_index: int, today: datetime.date) -> datetime.date:
    """The next date (today included) whose datetime.weekday() == weekday_index."""
    delta = (weekday_index - today.weekday()) % 7
    return today + datetime.timedelta(days=delta)


def write_json(path: str, data) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'))
    return os.path.getsize(path)


def main():
    conn = sqlite3.connect(DB_NAME)
    cur = conn.cursor()

    print(f"Reading from {DB_NAME}...")

    # 1. stops.json - everything stops/search and stops/nearby need. Also
    # doubles as the vehicle-sim "stops entity table" below.
    cur.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops")
    stops = cur.fetchall()
    stop_index_by_id = {row[0]: i for i, row in enumerate(stops)}
    size = write_json(os.path.join(OUT_DIR, 'stops.json'), stops)
    print(f"stops.json: {len(stops)} rows, {size / 1024:.1f} KB")

    # 2. routes.json - for disruption route_id -> route_short_name resolution.
    # Also doubles as the vehicle-sim "routes entity table" below.
    cur.execute("SELECT route_id, route_short_name, route_long_name, route_type FROM routes")
    routes = cur.fetchall()
    route_index_by_id = {row[0]: i for i, row in enumerate(routes)}
    size = write_json(os.path.join(OUT_DIR, 'routes.json'), routes)
    print(f"routes.json: {len(routes)} rows, {size / 1024:.1f} KB")

    # 3. vehicle-sim/<weekday>.json - one per weekday. Segment rows reference
    # stops.json/routes.json by index instead of duplicating names/
    # coordinates; only the trip_id list is per-weekday (trip sets differ by
    # day), so segments reference it by index too.
    today = datetime.date.today()
    for idx, weekday_col in enumerate(WEEKDAY_COLUMNS):
        rep_date = next_occurrence_of_weekday(idx, today)
        date_str = rep_date.strftime('%Y%m%d')

        service_ids = active_service_ids(cur, date_str, weekday_col)
        raw_segments = bracketing_segments_for_day(cur, service_ids)

        trip_index_by_id: dict = {}
        trips: list = []
        encoded_segments = []
        skipped = 0
        for trip_id, from_secs, to_secs, next_dep_secs, from_stop_id, to_stop_id, route_id, direction_id in raw_segments:
            if from_stop_id not in stop_index_by_id or to_stop_id not in stop_index_by_id or route_id not in route_index_by_id:
                skipped += 1
                continue

            trip_idx = trip_index_by_id.get(trip_id)
            if trip_idx is None:
                trip_idx = len(trips)
                trip_index_by_id[trip_id] = trip_idx
                trips.append(trip_id)

            encoded_segments.append([
                trip_idx, from_secs, to_secs, next_dep_secs,
                stop_index_by_id[from_stop_id], stop_index_by_id[to_stop_id],
                route_index_by_id[route_id], direction_id,
            ])

        if skipped:
            print(f"  (skipped {skipped} segment(s) referencing a stop/route not present in stops.json/routes.json)")

        out_path = os.path.join(VEHICLE_SIM_DIR, f'{weekday_col}.json')
        size = write_json(out_path, {'trips': trips, 'segments': encoded_segments})
        print(
            f"vehicle-sim/{weekday_col}.json: represented by {rep_date} ({date_str}), "
            f"{len(service_ids)} active service_id(s), {len(trips)} trips, "
            f"{len(encoded_segments)} segments, {size / 1024:.1f} KB"
        )

    conn.close()
    print("\nPrecompute complete.")


if __name__ == '__main__':
    main()
