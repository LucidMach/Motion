import os
import sqlite3
import sys
from typing import Any, Dict, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing.directional_routing import DB_NAME
from server.services.network_service import get_all_routes_metadata, get_metro_lines_geojson

# GTFS route_type values used throughout gtfs_schedule.db (matches
# directional_routing.get_mode_name's convention: 0=Tram, 400=Train, 3=Bus).
MODE_ROUTE_TYPES = {"train": 400, "tram": 0, "bus": 3}

# Trams and buses each run under one flat official PTV mode color - unlike
# train, which varies per line group (see network_service.LINE_METADATA).
MODE_FLAT_COLORS = {"tram": "#78BE20", "bus": "#FF8200"}
DEFAULT_MODE_COLOR = "#38BDF8"


def get_routes_for_mode(mode: str) -> List[Dict[str, Any]]:
    """Lists every route for a transit mode, for populating a route picker."""
    if mode == "train":
        return get_all_routes_metadata()

    route_type = MODE_ROUTE_TYPES.get(mode)
    if route_type is None:
        return []

    conn = sqlite3.connect(DB_NAME)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT DISTINCT route_short_name, route_long_name FROM routes "
            "WHERE route_type = ? AND route_short_name != '' ORDER BY route_short_name",
            (route_type,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    color = MODE_FLAT_COLORS.get(mode, DEFAULT_MODE_COLOR)
    seen: Dict[str, Dict[str, Any]] = {}
    for short_name, long_name in rows:
        # A route_short_name can span multiple route_ids (e.g. inbound/outbound
        # recorded as distinct GTFS routes) - dedup to one picker entry each.
        if short_name not in seen:
            seen[short_name] = {
                "route_id": short_name,
                "route_short_name": short_name,
                "route_long_name": long_name,
                "color": color,
                "mode": mode,
            }
    return list(seen.values())


def _build_tram_bus_route_shape(mode: str, route_short_name: str) -> Dict[str, Any]:
    route_type = MODE_ROUTE_TYPES[mode]
    color = MODE_FLAT_COLORS.get(mode, DEFAULT_MODE_COLOR)

    conn = sqlite3.connect(DB_NAME)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT t.trip_id, t.direction_id
            FROM trips t
            JOIN routes r ON t.route_id = r.route_id
            WHERE r.route_type = ? AND r.route_short_name = ?
            """,
            (route_type, route_short_name),
        )

        # One representative trip per direction is enough to trace the route's
        # physical path - GTFS timetables repeat the same shape across dozens
        # of scheduled trips per day.
        representative_trip_by_direction: Dict[Optional[int], str] = {}
        for trip_id, direction_id in cur.fetchall():
            if direction_id not in representative_trip_by_direction:
                representative_trip_by_direction[direction_id] = trip_id

        features = []
        for direction_id, trip_id in representative_trip_by_direction.items():
            cur.execute(
                """
                SELECT s.stop_lon, s.stop_lat
                FROM stop_times st
                JOIN stops s ON st.stop_id = s.stop_id
                WHERE st.trip_id = ?
                ORDER BY st.stop_sequence
                """,
                (trip_id,),
            )
            coords = [[lon, lat] for lon, lat in cur.fetchall()]
            if len(coords) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coords},
                    "properties": {
                        "route_short_name": route_short_name,
                        "direction_id": direction_id,
                        "color": color,
                        "mode": mode,
                    },
                }
            )
    finally:
        conn.close()

    return {"type": "FeatureCollection", "features": features}


def get_route_shape(mode: str, route_short_name: str) -> Dict[str, Any]:
    """
    Returns a GeoJSON FeatureCollection tracing a route's physical path, for
    highlighting it on the map. Train uses the precise official shapes already
    generated from the GTFS zip; tram/bus approximate the path by connecting
    consecutive scheduled stops in a straight line (no shapes.txt for those
    feeds yet), one LineString per direction of travel.
    """
    if mode == "train":
        lines = get_metro_lines_geojson()
        features = [
            f
            for f in lines.get("features", [])
            if f.get("properties", {}).get("route_short_name") == route_short_name
        ]
        return {"type": "FeatureCollection", "features": features}

    if mode not in MODE_ROUTE_TYPES:
        return {"type": "FeatureCollection", "features": []}

    return _build_tram_bus_route_shape(mode, route_short_name)
