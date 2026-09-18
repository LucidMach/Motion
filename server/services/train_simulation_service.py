import os
import sqlite3
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing.directional_routing import DB_NAME, calculate_bearing
from ptv_realtime.ptv_realtime import melbourne_now
from server.services.network_service import get_all_routes_metadata

METRO_TRAIN_ROUTE_TYPE = 400
DEFAULT_TRAIN_COLOR = "#0072CE"

# GTFS calendar.txt weekday column order, indexed by Python's datetime.weekday() (Monday=0).
_WEEKDAY_COLUMNS = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]


def _route_colors() -> Dict[str, str]:
    """Maps route_short_name -> official PTV line color, sourced from the same
    metadata that draws the static network lines, so live trains match their track color."""
    return {
        r["route_short_name"]: r["color"]
        for r in get_all_routes_metadata()
        if r.get("route_short_name")
    }


def _active_service_ids(cur: sqlite3.Cursor, service_date: datetime) -> set:
    """Service ids running on `service_date`, honoring calendar.txt weekday flags
    plus calendar_dates.txt added (1) / removed (2) exceptions for that exact date."""
    date_str = service_date.strftime("%Y%m%d")
    weekday_col = _WEEKDAY_COLUMNS[service_date.weekday()]

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


def _bracketing_segments(cur: sqlite3.Cursor, active_service_ids: set, now_secs: int) -> List[tuple]:
    """Finds, for every active train trip, the single pair of consecutive stops
    (`now_secs` sits between the first stop's departure and the second's arrival)
    that the train is currently between. Times beyond 86400s are how GTFS marks
    a trip belonging to the previous service day that continues past midnight,
    so `now_secs` may itself exceed 86400 when probing yesterday's service day."""
    if not active_service_ids:
        return []

    placeholders = ",".join("?" for _ in active_service_ids)
    query = f"""
        WITH train_trips AS (
            SELECT trip_id FROM trips
            WHERE service_id IN ({placeholders})
              AND route_id IN (SELECT route_id FROM routes WHERE route_type = ?)
        ),
        ordered AS (
            SELECT
                st.trip_id,
                st.stop_id AS from_stop_id,
                st.departure_time_secs AS from_secs,
                LEAD(st.stop_id) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS to_stop_id,
                LEAD(st.arrival_time_secs) OVER (PARTITION BY st.trip_id ORDER BY st.stop_sequence) AS to_secs
            FROM stop_times st
            WHERE st.trip_id IN (SELECT trip_id FROM train_trips)
        )
        SELECT
            o.trip_id, o.from_secs, o.to_secs,
            sf.stop_lat, sf.stop_lon, st2.stop_lat, st2.stop_lon,
            r.route_short_name, r.route_long_name
        FROM ordered o
        JOIN stops sf ON sf.stop_id = o.from_stop_id
        JOIN stops st2 ON st2.stop_id = o.to_stop_id
        JOIN trips t ON t.trip_id = o.trip_id
        JOIN routes r ON r.route_id = t.route_id
        WHERE o.to_stop_id IS NOT NULL
          AND o.from_secs <= ?
          AND o.to_secs >= ?
          AND r.route_short_name != 'Replacement Bus'
        ORDER BY o.from_secs ASC
    """
    cur.execute(query, list(active_service_ids) + [METRO_TRAIN_ROUTE_TYPE, now_secs, now_secs])
    return cur.fetchall()


def get_active_train_positions(now: Optional[datetime] = None, db_path: str = DB_NAME) -> List[Dict[str, Any]]:
    """
    Returns the simulated (schedule-interpolated) position of every Melbourne Metro
    train currently in service, derived purely from static GTFS timetable data -
    no live GPS feed involved. Each train's position is linearly interpolated
    between the two stops it's currently between, based on elapsed scheduled time.
    """
    now = now or melbourne_now()
    colors = _route_colors()

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        # A trip departing before midnight can still be "in service" after it,
        # recorded under times like 24:15:00 against *yesterday's* service day.
        # So today's and yesterday's active services are both probed, the latter
        # with `now` re-expressed as seconds-past-yesterday-midnight.
        candidates = [
            (now, now.hour * 3600 + now.minute * 60 + now.second),
            (now - timedelta(days=1), now.hour * 3600 + now.minute * 60 + now.second + 86400),
        ]

        by_trip: Dict[str, Dict[str, Any]] = {}
        for service_date, now_secs in candidates:
            active_ids = _active_service_ids(cur, service_date)
            for row in _bracketing_segments(cur, active_ids, now_secs):
                (
                    trip_id, from_secs, to_secs,
                    from_lat, from_lon, to_lat, to_lon,
                    route_short_name, route_long_name,
                ) = row

                span = to_secs - from_secs
                progress = (now_secs - from_secs) / span if span > 0 else 0.0
                progress = max(0.0, min(1.0, progress))

                lat = from_lat + (to_lat - from_lat) * progress
                lon = from_lon + (to_lon - from_lon) * progress
                bearing = calculate_bearing(from_lat, from_lon, to_lat, to_lon)

                # Rows are consumed in from_secs order, so a later (larger
                # from_secs) match for the same trip_id - possible only when
                # `now_secs` lands exactly on a stop boundary - overwrites the
                # earlier one, keeping the segment the train has most recently departed.
                by_trip[trip_id] = {
                    "trip_id": trip_id,
                    "route_short_name": route_short_name,
                    "route_long_name": route_long_name,
                    "color": colors.get(route_short_name, DEFAULT_TRAIN_COLOR),
                    "lat": lat,
                    "lon": lon,
                    "bearing_deg": bearing,
                    "progress": progress,
                }

        return list(by_trip.values())
    finally:
        conn.close()


def get_active_train_positions_geojson(now: Optional[datetime] = None, db_path: str = DB_NAME) -> Dict[str, Any]:
    """GeoJSON FeatureCollection wrapper around get_active_train_positions(), ready to serve to the map."""
    positions = get_active_train_positions(now=now, db_path=db_path)
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                "properties": {
                    "trip_id": p["trip_id"],
                    "route_short_name": p["route_short_name"],
                    "route_long_name": p["route_long_name"],
                    "color": p["color"],
                    "bearing_deg": p["bearing_deg"],
                    "progress": p["progress"],
                },
            }
            for p in positions
        ],
    }
