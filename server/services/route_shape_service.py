import os
import sqlite3
import sys
from typing import Any, Dict, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing.directional_routing import DB_NAME
from server.services.network_service import (
    get_all_routes_metadata,
    get_metro_lines_geojson,
    get_tram_routes_metadata,
    get_tram_route_color,
    is_city_loop_station,
    GEOJSON_DIR,
)
import json

# GTFS route_type values used throughout gtfs_schedule.db (matches
# directional_routing.get_mode_name's convention: 0=Tram, 400=Train, 3=Bus).
MODE_ROUTE_TYPES = {"train": 400, "tram": 0, "bus": 3}

# Bus runs under flat official PTV mode color (#FF8200).
# Tram colors are dynamically fetched per route from GTFS Feed 3 or network_service.
MODE_FLAT_COLORS = {"tram": "#78BE20", "bus": "#FF8200"}
DEFAULT_MODE_COLOR = "#38BDF8"


_CACHED_ROUTES_BY_MODE: Dict[str, List[Dict[str, Any]]] = {}
_CACHED_STATIC_ROUTES: Optional[Dict[str, List[Dict[str, Any]]]] = None
_CACHED_STATIC_ROUTE_STOPS: Optional[Dict[str, List[Dict[str, Any]]]] = None


def _load_static_routes_if_available() -> Optional[Dict[str, List[Dict[str, Any]]]]:
    global _CACHED_STATIC_ROUTES
    if _CACHED_STATIC_ROUTES is not None:
        return _CACHED_STATIC_ROUTES
    routes_file = os.path.join(GEOJSON_DIR, "routes.json")
    if os.path.exists(routes_file):
        try:
            with open(routes_file, "r", encoding="utf-8") as f:
                _CACHED_STATIC_ROUTES = json.load(f)
                return _CACHED_STATIC_ROUTES
        except Exception:
            pass
    return None


def _load_static_route_stops_if_available() -> Optional[Dict[str, List[Dict[str, Any]]]]:
    global _CACHED_STATIC_ROUTE_STOPS
    if _CACHED_STATIC_ROUTE_STOPS is not None:
        return _CACHED_STATIC_ROUTE_STOPS
    stops_file = os.path.join(GEOJSON_DIR, "route_stops.json")
    if os.path.exists(stops_file):
        try:
            with open(stops_file, "r", encoding="utf-8") as f:
                _CACHED_STATIC_ROUTE_STOPS = json.load(f)
                return _CACHED_STATIC_ROUTE_STOPS
        except Exception:
            pass
    return None


def get_routes_for_mode(mode: str) -> List[Dict[str, Any]]:
    """Lists every route for a transit mode, for populating a route picker."""
    if mode == "train":
        return get_all_routes_metadata()

    if mode in _CACHED_ROUTES_BY_MODE:
        return _CACHED_ROUTES_BY_MODE[mode]

    route_type = MODE_ROUTE_TYPES.get(mode)
    if route_type is None:
        return []

    conn = sqlite3.connect(DB_NAME)
    try:
        cur = conn.cursor()
        if mode == "tram":
            cur.execute(
                """
                SELECT DISTINCT route_short_name, route_long_name FROM routes
                WHERE route_type = 0 AND route_short_name != ''
                ORDER BY CAST(route_short_name AS INTEGER), route_short_name
                """
            )
            rows = cur.fetchall()
        elif mode == "bus":
            cur.execute(
                """
                SELECT r.route_short_name, r.route_long_name
                FROM routes r
                JOIN trips t ON r.route_id = t.route_id
                WHERE r.route_type = 3
                  AND r.route_short_name != ''
                  AND r.route_long_name != ''
                  AND r.route_short_name NOT LIKE 'ANZAC%'
                  AND r.route_short_name NOT LIKE 's%'
                  AND r.route_short_name NOT LIKE '%-R'
                  AND r.route_short_name != 'PEX'
                GROUP BY r.route_short_name
                HAVING count(t.trip_id) >= 40
                ORDER BY
                    CAST(r.route_short_name AS INTEGER),
                    r.route_short_name
                """
            )
            rows = cur.fetchall()
        else:
            rows = []
    finally:
        conn.close()

    default_color = MODE_FLAT_COLORS.get(mode, DEFAULT_MODE_COLOR)
    tram_meta = get_tram_routes_metadata() if mode == "tram" else {}
    seen: Dict[str, Dict[str, Any]] = {}
    for short_name, long_name in rows:
        if short_name not in seen:
            if mode == "tram":
                t_info = tram_meta.get(short_name, {})
                c = t_info.get("color") or get_tram_route_color(short_name)
                tc = t_info.get("text_color", "#FFFFFF")
                seen[short_name] = {
                    "route_id": short_name,
                    "route_short_name": short_name,
                    "route_long_name": long_name,
                    "color": c,
                    "text_color": tc,
                    "group": "Yarra Trams",
                    "mode": mode,
                }
            else:
                seen[short_name] = {
                    "route_id": short_name,
                    "route_short_name": short_name,
                    "route_long_name": long_name,
                    "color": default_color,
                    "mode": mode,
                }
    results = list(seen.values())
    _CACHED_ROUTES_BY_MODE[mode] = results
    return results


def _build_tram_bus_route_shape(mode: str, route_short_name: str) -> Dict[str, Any]:
    route_type = MODE_ROUTE_TYPES[mode]
    color = get_tram_route_color(route_short_name) if mode == "tram" else MODE_FLAT_COLORS.get(mode, DEFAULT_MODE_COLOR)

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


def get_route_stops(mode: str, route_short_name: str) -> List[Dict[str, Any]]:
    """
    Returns ordered stops along a representative trip for the given route.
    """
    route_type = MODE_ROUTE_TYPES.get(mode)
    if route_type is None:
        return []

    static_stops = _load_static_route_stops_if_available()
    if static_stops:
        key = f"{mode}:{route_short_name}"
        if key in static_stops:
            return static_stops[key]

    conn = sqlite3.connect(DB_NAME)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT t.trip_id
            FROM trips t
            JOIN stop_times st ON t.trip_id = st.trip_id
            WHERE t.route_id IN (
                SELECT route_id FROM routes
                WHERE route_type = ? AND route_short_name = ?
            )
            GROUP BY t.trip_id
            ORDER BY COUNT(st.stop_id) DESC
            LIMIT 1
            """,
            (route_type, route_short_name),
        )
        row = cur.fetchone()
        if not row:
            return []

        trip_id = row[0]
        cur.execute(
            """
            SELECT s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
            FROM stop_times st
            JOIN stops s ON st.stop_id = s.stop_id
            WHERE st.trip_id = ?
            ORDER BY st.stop_sequence ASC
            """,
            (trip_id,),
        )
        stops = []
        for stop_id, stop_name, lat, lon, seq in cur.fetchall():
            clean_name = stop_name.replace(" Railway Station", "").replace(" Station", "")
            stops.append({
                "stop_id": str(stop_id),
                "stop_name": clean_name,
                "full_name": stop_name,
                "stop_lat": float(lat),
                "stop_lon": float(lon),
                "stop_sequence": int(seq),
                "is_interchange": is_city_loop_station(clean_name),
            })
        return stops
    finally:
        conn.close()

