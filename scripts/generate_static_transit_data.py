import os
import sys
import json
import sqlite3
from typing import Dict, Any, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing.directional_routing import DB_NAME
from server.services.network_service import (
    get_all_routes_metadata,
    get_tram_routes_metadata,
    get_tram_route_color,
    get_metro_lines_geojson,
    generate_tram_geojson,
    is_city_loop_station,
    clean_station_name,
)

DEFAULT_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "UI", "public", "data", "transit")

# Curated categories for Melbourne buses
def _get_bus_group(short_name: str) -> str:
    s = short_name.strip()
    if s in ("900", "901", "902", "903", "905", "906", "907", "908"):
        return "SmartBus / Orbital"
    if s.isdigit() and int(s) < 300:
        return "Frequent & University"
    return "Metro Grid"


def extract_all_routes(db_path: str = DB_NAME) -> Dict[str, List[Dict[str, Any]]]:
    """Extracts all route metadata for trains, trams, and buses."""
    train_routes = get_all_routes_metadata()
    for r in train_routes:
        r["mode"] = "train"

    # Trams
    conn = sqlite3.connect(db_path)
    tram_routes: List[Dict[str, Any]] = []
    bus_routes: List[Dict[str, Any]] = []
    try:
        cur = conn.cursor()
        # Trams: route_type = 0
        cur.execute(
            """
            SELECT DISTINCT route_id, route_short_name, route_long_name
            FROM routes
            WHERE route_type = 0 AND route_short_name != ''
            """
        )
        for r_id, s_name, l_name in cur.fetchall():
            color = get_tram_route_color(s_name)
            tram_routes.append({
                "route_id": r_id,
                "route_short_name": s_name,
                "route_long_name": l_name or f"Route {s_name}",
                "color": color,
                "text_color": "#FFFFFF",
                "group": "Yarra Trams",
                "mode": "tram"
            })
        tram_routes.sort(key=lambda r: (int(r["route_short_name"]) if r["route_short_name"].isdigit() else 999, r["route_short_name"]))

        # Buses: route_type = 3
        cur.execute(
            """
            SELECT DISTINCT route_id, route_short_name, route_long_name
            FROM routes
            WHERE route_type = 3 AND route_short_name != '' AND route_short_name != 'Replacement Bus'
            """
        )
        seen_bus_names = set()
        for r_id, s_name, l_name in cur.fetchall():
            if s_name in seen_bus_names:
                continue
            seen_bus_names.add(s_name)
            bus_routes.append({
                "route_id": r_id,
                "route_short_name": s_name,
                "route_long_name": l_name or f"Bus {s_name}",
                "color": "#FF8200",
                "text_color": "#FFFFFF",
                "group": _get_bus_group(s_name),
                "mode": "bus"
            })
        bus_routes.sort(key=lambda r: (int(r["route_short_name"]) if r["route_short_name"].isdigit() else 9999, r["route_short_name"]))
    finally:
        conn.close()

    return {
        "train": train_routes,
        "tram": tram_routes,
        "bus": bus_routes,
    }


def extract_all_route_stops(db_path: str = DB_NAME) -> Dict[str, List[Dict[str, Any]]]:
    """Extracts ordered stops for every route across train, tram, and bus."""
    conn = sqlite3.connect(db_path)
    route_stops: Dict[str, List[Dict[str, Any]]] = {}
    try:
        cur = conn.cursor()

        # Build map of (route_type, route_short_name) -> representative trip_id (trip with max stops)
        # Using a single window query over trips and stop_times
        query = """
            WITH trip_stop_counts AS (
                SELECT
                    r.route_type,
                    r.route_short_name,
                    t.trip_id,
                    COUNT(st.stop_id) as stop_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY r.route_type, r.route_short_name
                        ORDER BY COUNT(st.stop_id) DESC, t.trip_id ASC
                    ) as rn
                FROM routes r
                JOIN trips t ON t.route_id = r.route_id
                JOIN stop_times st ON st.trip_id = t.trip_id
                WHERE r.route_short_name != '' AND r.route_short_name != 'Replacement Bus'
                GROUP BY r.route_type, r.route_short_name, t.trip_id
            )
            SELECT route_type, route_short_name, trip_id
            FROM trip_stop_counts
            WHERE rn = 1
        """
        cur.execute(query)
        rep_trips = cur.fetchall()

        mode_map = {400: "train", 0: "tram", 3: "bus"}
        trip_ids = [row[2] for row in rep_trips]
        trip_to_key = {row[2]: f"{mode_map.get(row[0], 'other')}:{row[1]}" for row in rep_trips}

        # Query stops for all representative trips in batches
        BATCH_SIZE = 500
        for i in range(0, len(trip_ids), BATCH_SIZE):
            batch_trips = trip_ids[i:i + BATCH_SIZE]
            placeholders = ",".join("?" for _ in batch_trips)
            cur.execute(
                f"""
                SELECT st.trip_id, s.stop_id, s.stop_name, s.stop_lat, s.stop_lon, st.stop_sequence
                FROM stop_times st
                JOIN stops s ON st.stop_id = s.stop_id
                WHERE st.trip_id IN ({placeholders})
                ORDER BY st.trip_id, st.stop_sequence ASC
                """,
                batch_trips,
            )
            for trip_id, stop_id, stop_name, lat, lon, seq in cur.fetchall():
                key = trip_to_key.get(trip_id)
                if not key:
                    continue
                if key not in route_stops:
                    route_stops[key] = []
                clean_name = clean_station_name(stop_name)
                route_stops[key].append({
                    "stop_id": str(stop_id),
                    "stop_name": clean_name,
                    "full_name": stop_name,
                    "stop_lat": float(lat),
                    "stop_lon": float(lon),
                    "stop_sequence": int(seq),
                    "is_interchange": is_city_loop_station(clean_name),
                })
    finally:
        conn.close()

    return route_stops


def extract_all_route_shapes(db_path: str = DB_NAME) -> Dict[str, Any]:
    """Combines train and tram shapes into a single FeatureCollection."""
    train_lines = get_metro_lines_geojson()
    tram_lines, _ = generate_tram_geojson()

    features = []
    # Add train features
    for f in train_lines.get("features", []):
        props = dict(f.get("properties", {}))
        props["mode"] = "train"
        features.append({
            "type": "Feature",
            "geometry": f.get("geometry"),
            "properties": props
        })

    # Add tram features
    for f in tram_lines.get("features", []):
        props = dict(f.get("properties", {}))
        props["mode"] = "tram"
        features.append({
            "type": "Feature",
            "geometry": f.get("geometry"),
            "properties": props
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }


def generate_static_transit_bundle(out_dir: str = DEFAULT_OUTPUT_DIR) -> Dict[str, str]:
    """Generates and writes routes.json, route_stops.json, and route_shapes.geojson."""
    os.makedirs(out_dir, exist_ok=True)

    print(f"[StaticTransitBuilder] Extracting routes...")
    routes_data = extract_all_routes()
    routes_file = os.path.join(out_dir, "routes.json")
    with open(routes_file, "w", encoding="utf-8") as f:
        json.dump(routes_data, f, indent=2)
    print(f"  ✓ Saved routes.json ({len(routes_data['train'])} trains, {len(routes_data['tram'])} trams, {len(routes_data['bus'])} buses)")

    print(f"[StaticTransitBuilder] Extracting route stops...")
    route_stops_data = extract_all_route_stops()
    route_stops_file = os.path.join(out_dir, "route_stops.json")
    with open(route_stops_file, "w", encoding="utf-8") as f:
        json.dump(route_stops_data, f, indent=2)
    print(f"  ✓ Saved route_stops.json ({len(route_stops_data)} routes indexed)")

    print(f"[StaticTransitBuilder] Extracting route shapes...")
    route_shapes_data = extract_all_route_shapes()
    route_shapes_file = os.path.join(out_dir, "route_shapes.geojson")
    with open(route_shapes_file, "w", encoding="utf-8") as f:
        json.dump(route_shapes_data, f)
    print(f"  ✓ Saved route_shapes.geojson ({len(route_shapes_data['features'])} line features)")

    # Deduplicate canonical shapes by route_short_name (longest line feature)
    best_by_route = {}
    for f in route_shapes_data["features"]:
        r_name = f.get("properties", {}).get("route_short_name")
        if not r_name or f.get("geometry", {}).get("type") != "LineString":
            continue
        coords_len = len(f.get("geometry", {}).get("coordinates", []))
        if r_name not in best_by_route or coords_len > len(best_by_route[r_name]["geometry"]["coordinates"]):
            best_by_route[r_name] = f

    canonical_shapes_file = os.path.join(out_dir, "canonical_route_shapes.json")
    with open(canonical_shapes_file, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": list(best_by_route.values())}, f)
    print(f"  ✓ Saved canonical_route_shapes.json ({len(best_by_route)} canonical routes)")

    return {
        "routes_file": routes_file,
        "route_stops_file": route_stops_file,
        "route_shapes_file": route_shapes_file,
        "canonical_shapes_file": canonical_shapes_file,
    }


if __name__ == "__main__":
    generate_static_transit_bundle()
