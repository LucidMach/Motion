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
from server.services.network_service import (
    get_all_routes_metadata,
    get_trip_shape_map,
    get_shape_polylines,
    get_tram_route_color,
    get_tram_trip_shape_map,
    get_tram_shape_polylines,
    get_all_trip_shape_map,
    get_all_shape_polylines,
    clean_station_name,
)
from server.services.geometry_utils import (
    project_point_to_polyline,
    point_at_arc_length,
    slice_polyline_by_arc_length,
)

METRO_TRAIN_ROUTE_TYPE = 400
METRO_TRAM_ROUTE_TYPE = 0
DEFAULT_TRAIN_COLOR = "#0072CE"
STEP_SECONDS = 4

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


def _bracketing_segments(
    cur: sqlite3.Cursor,
    active_service_ids: set,
    now_secs: int,
    route_types: tuple = (METRO_TRAIN_ROUTE_TYPE,),
) -> List[tuple]:
    """Finds, for every active trip across the requested route_types, the bracketing
    consecutive stops and upcoming departure time. Times beyond 86400s are how GTFS marks
    a trip belonging to the previous service day that continues past midnight."""
    if not active_service_ids or not route_types:
        return []

    placeholders = ",".join("?" for _ in active_service_ids)
    rt_placeholders = ",".join("?" for _ in route_types)
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
            sf.stop_lat, sf.stop_lon, st2.stop_lat, st2.stop_lon,
            r.route_short_name, r.route_long_name, r.route_type,
            o.from_stop_id, o.to_stop_id, sf.stop_name, st2.stop_name,
            t.direction_id
        FROM ordered o
        JOIN stops sf ON sf.stop_id = o.from_stop_id
        JOIN stops st2 ON st2.stop_id = o.to_stop_id
        JOIN trips t ON t.trip_id = o.trip_id
        JOIN routes r ON r.route_id = t.route_id
        WHERE o.to_stop_id IS NOT NULL
          AND o.from_secs <= ?
          AND COALESCE(o.next_dep_secs, o.to_secs) >= ?
          AND r.route_short_name != 'Replacement Bus'
        ORDER BY o.from_secs ASC
    """
    cur.execute(query, list(active_service_ids) + list(route_types) + [now_secs, now_secs])
    return cur.fetchall()


def _interpolate_position(
    trip_id: str,
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    progress: float,
    trip_shape_map: Dict[str, str],
    shape_polylines: Dict[str, List[List[float]]],
    progress_next: Optional[float] = None,
) -> tuple:
    """
    Snaps a vehicle's position (and heading) to its actual rail/track shape and
    slices the intermediate polyline vertices between current progress and next
    step progress, so the frontend client animates along intermediate curves
    rather than cutting a straight chord across buildings.
    """
    if progress_next is None:
        progress_next = min(1.0, progress + 0.05) if progress < 1.0 else 1.0

    try:
        shape_id = trip_shape_map.get(trip_id)
        polyline = shape_polylines.get(shape_id) if shape_id else None
        if not polyline or len(polyline) < 2:
            raise ValueError("no shape")

        from_proj = project_point_to_polyline((from_lon, from_lat), polyline)
        to_proj = project_point_to_polyline((to_lon, to_lat), polyline)
        if not from_proj or not to_proj:
            raise ValueError("projection failed")

        span_km = to_proj["arc_length_km"] - from_proj["arc_length_km"]
        target_km = from_proj["arc_length_km"] + span_km * progress
        target_km_next = from_proj["arc_length_km"] + span_km * progress_next

        result = point_at_arc_length(polyline, target_km)
        if not result:
            raise ValueError("arc-length lookup failed")

        path = slice_polyline_by_arc_length(polyline, target_km, target_km_next)
        snapped_lon, snapped_lat = result["point"]

        if len(path) >= 2 and (path[0][0] != path[1][0] or path[0][1] != path[1][1]):
            bearing = calculate_bearing(path[0][1], path[0][0], path[1][1], path[1][0])
        else:
            bearing = result["bearing_deg"]

        return snapped_lat, snapped_lon, bearing, path
    except Exception:
        lat = from_lat + (to_lat - from_lat) * progress
        lon = from_lon + (to_lon - from_lon) * progress
        next_lat = from_lat + (to_lat - from_lat) * progress_next
        next_lon = from_lon + (to_lon - from_lon) * progress_next
        bearing = calculate_bearing(from_lat, from_lon, to_lat, to_lon)
        path = [(lon, lat), (next_lon, next_lat)]
        return lat, lon, bearing, path


def get_active_vehicle_positions(
    mode: str = "all",
    now: Optional[datetime] = None,
    db_path: str = DB_NAME
) -> List[Dict[str, Any]]:
    """
    Returns simulated positions for vehicles currently in service (trains, trams, or all),
    snapped to track shapes and including intermediate path vertices for curve-following animation.
    """
    now = now or melbourne_now()
    train_colors = _route_colors()

    if mode == "train":
        route_types = (METRO_TRAIN_ROUTE_TYPE,)
        trip_shape_map = get_trip_shape_map()
        shape_polylines = get_shape_polylines()
    elif mode == "tram":
        route_types = (METRO_TRAM_ROUTE_TYPE,)
        trip_shape_map = get_tram_trip_shape_map()
        shape_polylines = get_tram_shape_polylines()
    else:  # "all"
        route_types = (METRO_TRAIN_ROUTE_TYPE, METRO_TRAM_ROUTE_TYPE)
        trip_shape_map = get_all_trip_shape_map()
        shape_polylines = get_all_shape_polylines()

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        candidates = [
            (now, now.hour * 3600 + now.minute * 60 + now.second),
            (now - timedelta(days=1), now.hour * 3600 + now.minute * 60 + now.second + 86400),
        ]

        by_trip: Dict[str, Dict[str, Any]] = {}
        for service_date, now_secs in candidates:
            active_ids = _active_service_ids(cur, service_date)
            rows = _bracketing_segments(cur, active_ids, now_secs, route_types=route_types)
            if not rows:
                continue

            # Batch resolve terminal destination stop names for these active trips
            trip_ids = list({r[0] for r in rows})
            dest_by_trip: Dict[str, str] = {}
            if trip_ids:
                t_placeholders = ",".join("?" for _ in trip_ids)
                try:
                    cur.execute(
                        f"""
                        SELECT st.trip_id, s.stop_name, MAX(st.stop_sequence)
                        FROM stop_times st
                        JOIN stops s ON st.stop_id = s.stop_id
                        WHERE st.trip_id IN ({t_placeholders})
                        GROUP BY st.trip_id
                        """,
                        trip_ids,
                    )
                    for t_id, s_name, _ in cur.fetchall():
                        dest_by_trip[t_id] = clean_station_name(s_name)
                except Exception:
                    pass

            for row in rows:
                (
                    trip_id, from_secs, to_secs, next_dep_secs,
                    from_lat, from_lon, to_lat, to_lon,
                    route_short_name, route_long_name, route_type,
                    from_stop_id, to_stop_id, from_stop_name, to_stop_name,
                    direction_id,
                ) = row

                veh_mode = "tram" if route_type == METRO_TRAM_ROUTE_TYPE else "train"

                # Check dwelling state vs in-transit
                if to_secs is not None and now_secs >= to_secs and next_dep_secs is not None and now_secs <= next_dep_secs:
                    status = "dwelling"
                    progress = 1.0
                    progress_next = 1.0
                else:
                    status = "in_transit"
                    span = to_secs - from_secs if to_secs is not None else 0
                    progress = (now_secs - from_secs) / span if span > 0 else 0.0
                    progress = max(0.0, min(1.0, progress))
                    progress_next = (now_secs + STEP_SECONDS - from_secs) / span if span > 0 else 1.0
                    progress_next = max(0.0, min(1.0, progress_next))

                lat, lon, bearing, path = _interpolate_position(
                    trip_id, from_lat, from_lon, to_lat, to_lon, progress,
                    trip_shape_map, shape_polylines, progress_next=progress_next,
                )

                if veh_mode == "tram":
                    color = get_tram_route_color(route_short_name)
                else:
                    color = train_colors.get(route_short_name, DEFAULT_TRAIN_COLOR)

                from_clean = clean_station_name(from_stop_name)
                to_clean = clean_station_name(to_stop_name)
                destination = dest_by_trip.get(trip_id, to_clean)
                is_stopped = status == "dwelling" or progress >= 0.96 or progress <= 0.04
                curr_stop_id = to_stop_id if progress >= 0.5 else from_stop_id
                curr_stop_name = to_clean if progress >= 0.5 else from_clean

                by_trip[trip_id] = {
                    "trip_id": trip_id,
                    "route_short_name": route_short_name,
                    "route_long_name": route_long_name,
                    "mode": veh_mode,
                    "color": color,
                    "lat": lat,
                    "lon": lon,
                    "bearing_deg": bearing,
                    "progress": progress,
                    "path": [[p[0], p[1]] for p in path],
                    "status": status,
                    "from_stop_id": str(from_stop_id),
                    "to_stop_id": str(to_stop_id),
                    "from_stop_name": from_clean,
                    "to_stop_name": to_clean,
                    "current_stop_id": str(curr_stop_id),
                    "current_stop_name": curr_stop_name,
                    "destination": destination,
                    "direction_id": direction_id,
                    "is_stopped": is_stopped,
                }

        return list(by_trip.values())
    finally:
        conn.close()


def get_active_train_positions(now: Optional[datetime] = None, db_path: str = DB_NAME) -> List[Dict[str, Any]]:
    """Returns the simulated position of every Metro train currently in service."""
    return get_active_vehicle_positions(mode="train", now=now, db_path=db_path)


def get_active_tram_positions(now: Optional[datetime] = None, db_path: str = DB_NAME) -> List[Dict[str, Any]]:
    """Returns the simulated position of every Yarra Tram currently in service."""
    return get_active_vehicle_positions(mode="tram", now=now, db_path=db_path)


def get_active_vehicles_geojson(mode: str = "all", now: Optional[datetime] = None, db_path: str = DB_NAME) -> Dict[str, Any]:
    """GeoJSON FeatureCollection wrapper around get_active_vehicle_positions(), ready to serve to the map."""
    positions = get_active_vehicle_positions(mode=mode, now=now, db_path=db_path)
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
                    "mode": p["mode"],
                    "color": p["color"],
                    "bearing_deg": p["bearing_deg"],
                    "progress": p["progress"],
                    "path": p["path"],
                    "status": p["status"],
                    "from_stop_id": p.get("from_stop_id"),
                    "to_stop_id": p.get("to_stop_id"),
                    "from_stop_name": p.get("from_stop_name"),
                    "to_stop_name": p.get("to_stop_name"),
                    "current_stop_id": p.get("current_stop_id"),
                    "current_stop_name": p.get("current_stop_name"),
                    "destination": p.get("destination"),
                    "direction_id": p.get("direction_id"),
                    "is_stopped": p.get("is_stopped", False),
                },
            }
            for p in positions
        ],
        "telemetry": {
            "ptv_feed": "simulated",
            "vehicles_count": len(positions),
            "mode": mode,
        },
    }


def get_active_train_positions_geojson(now: Optional[datetime] = None, db_path: str = DB_NAME) -> Dict[str, Any]:
    """GeoJSON FeatureCollection wrapper around get_active_train_positions()."""
    return get_active_vehicles_geojson(mode="train", now=now, db_path=db_path)

