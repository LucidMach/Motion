import os
import sys
import json
import zipfile
import csv
import io
import sqlite3
from typing import Dict, Any, List, Optional

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GEOJSON_DIR = os.path.join(PROJECT_ROOT, "UI", "public", "data", "transit")

# Official PTV Metro Line Colors
LINE_METADATA = {
    "Alamein": {"color": "#152C6B", "group": "Burnley Group"},
    "Belgrave": {"color": "#152C6B", "group": "Burnley Group"},
    "Lilydale": {"color": "#152C6B", "group": "Burnley Group"},
    "Glen Waverley": {"color": "#152C6B", "group": "Burnley Group"},
    "Cranbourne": {"color": "#34ACE1", "group": "Caulfield Group"},
    "Pakenham": {"color": "#34ACE1", "group": "Caulfield Group"},
    "Frankston": {"color": "#028430", "group": "Cross-City Group"},
    "Sandringham": {"color": "#F178AF", "group": "Cross-City Group"},
    "Werribee": {"color": "#028430", "group": "Cross-City Group"},
    "Williamstown": {"color": "#028430", "group": "Cross-City Group"},
    "Craigieburn": {"color": "#FFBE00", "group": "Northern Group"},
    "Upfield": {"color": "#FFBE00", "group": "Northern Group"},
    "Sunbury": {"color": "#FFBE00", "group": "Northern Group"},
    "Mernda": {"color": "#BE1014", "group": "Clifton Hill Group"},
    "Hurstbridge": {"color": "#BE1014", "group": "Clifton Hill Group"},
    "Stony Point": {"color": "#028430", "group": "Regional / Non-Electrified"},
    "Flemington Racecourse": {"color": "#95979A", "group": "Special Events"},
    "City Circle": {"color": "#0072CE", "group": "City Loop"},
}

_CACHED_LINES_GEOJSON: Optional[Dict[str, Any]] = None
_CACHED_STATIONS_GEOJSON: Optional[Dict[str, Any]] = None

# City Loop interchange stations, keyed by clean name (suffix already stripped)
# so "Flagstaff Station" and "Flagstaff Railway Station" both match regardless
# of which GTFS stop row wins the by-name dedup in generate_metro_geojson.
CITY_LOOP_STATIONS = {
    "Flinders Street",
    "Southern Cross",
    "Melbourne Central",
    "Parliament",
    "Flagstaff",
    "Richmond",
    "South Yarra",
    "North Melbourne",
    "Footscray",
    "Caulfield",
}


def clean_station_name(stop_name: str) -> str:
    """Strips the GTFS "Railway Station"/"Station" suffix for display and matching."""
    return stop_name.replace(" Railway Station", "").replace(" Station", "")


def is_city_loop_station(clean_name: str) -> bool:
    """Whether a station (by its already-cleaned name) is a City Loop interchange."""
    return clean_name in CITY_LOOP_STATIONS


def ensure_geojson_dir():
    os.makedirs(GEOJSON_DIR, exist_ok=True)


def generate_metro_geojson() -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Extracts high-precision train shapes, routes, and stations from GTFS Feed 2 (gtfs/2/google_transit.zip).
    Returns (lines_geojson, stations_geojson).
    """
    global _CACHED_LINES_GEOJSON, _CACHED_STATIONS_GEOJSON

    lines_file = os.path.join(GEOJSON_DIR, "ptv_metro_trains.geojson")
    stations_file = os.path.join(GEOJSON_DIR, "ptv_metro_stations.geojson")

    # If cached files already exist on disk, load and cache in memory
    if os.path.exists(lines_file) and os.path.exists(stations_file):
        try:
            with open(lines_file, "r", encoding="utf-8") as f:
                _CACHED_LINES_GEOJSON = json.load(f)
            with open(stations_file, "r", encoding="utf-8") as f:
                _CACHED_STATIONS_GEOJSON = json.load(f)
            if _CACHED_LINES_GEOJSON and _CACHED_STATIONS_GEOJSON:
                return _CACHED_LINES_GEOJSON, _CACHED_STATIONS_GEOJSON
        except Exception as e:
            print(f"[NetworkService] Warning reading cached GeoJSON files: {e}")

    zip_path = os.path.join(PROJECT_ROOT, "gtfs", "2", "google_transit.zip")
    if not os.path.exists(zip_path):
        print(f"[NetworkService] GTFS zip not found at {zip_path}, returning empty datasets.")
        empty_fc = {"type": "FeatureCollection", "features": []}
        return empty_fc, empty_fc

    ensure_geojson_dir()

    with zipfile.ZipFile(zip_path, "r") as z:
        # 1. Parse routes
        routes = {}
        with z.open("routes.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for r in reader:
                r_id = r["route_id"]
                s_name = r.get("route_short_name", "")
                if not s_name or s_name == "Replacement Bus":
                    continue
                color = r.get("route_color", "")
                hex_color = f"#{color}" if color else LINE_METADATA.get(s_name, {}).get("color", "#0072CE")
                routes[r_id] = {
                    "route_id": r_id,
                    "route_short_name": s_name,
                    "route_long_name": r.get("route_long_name", ""),
                    "color": hex_color,
                    "group": LINE_METADATA.get(s_name, {}).get("group", "Metro Network")
                }

        # 2. Map trip shape IDs to routes
        shape_to_route = {}
        with z.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for t in reader:
                r_id = t["route_id"]
                s_id = t.get("shape_id")
                if s_id and r_id in routes:
                    if s_id not in shape_to_route:
                        shape_to_route[s_id] = routes[r_id]

        # 3. Parse shapes
        shapes_coords: Dict[str, List[tuple]] = {}
        with z.open("shapes.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for s in reader:
                s_id = s["shape_id"]
                if s_id not in shape_to_route:
                    continue
                lat = float(s["shape_pt_lat"])
                lon = float(s["shape_pt_lon"])
                seq = int(s["shape_pt_sequence"])
                if s_id not in shapes_coords:
                    shapes_coords[s_id] = []
                shapes_coords[s_id].append((seq, lon, lat))

        # Build LineString features
        features = []
        for s_id, pts in shapes_coords.items():
            pts.sort(key=lambda x: x[0])
            coords = [[lon, lat] for _, lon, lat in pts]
            route_meta = shape_to_route[s_id]
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords
                },
                "properties": {
                    "shape_id": s_id,
                    "route_id": route_meta["route_id"],
                    "route_short_name": route_meta["route_short_name"],
                    "route_long_name": route_meta["route_long_name"],
                    "line_name": f"{route_meta['route_short_name']} Line",
                    "color": route_meta["color"],
                    "line_group": route_meta["group"],
                    "mode": "Metro Train",
                    "mode_code": "train_metro"
                }
            })

        lines_geojson = {
            "type": "FeatureCollection",
            "features": features
        }

        # 4. Parse Stations (stops.txt)
        station_features = []
        seen_stations = set()
        with z.open("stops.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for s in reader:
                stop_id = s["stop_id"]
                stop_name = s.get("stop_name", "").strip()
                loc_type = s.get("location_type", "0")
                
                # Deduplicate by stop name or primary station ID
                if not stop_name or stop_name in seen_stations:
                    continue
                seen_stations.add(stop_name)

                lat = float(s["stop_lat"])
                lon = float(s["stop_lon"])

                clean_name = clean_station_name(stop_name)

                station_features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    },
                    "properties": {
                        "stop_id": stop_id,
                        "stop_name": clean_name,
                        "full_name": stop_name,
                        "is_interchange": is_city_loop_station(clean_name),
                        "mode": "Metro Train"
                    }
                })

        stations_geojson = {
            "type": "FeatureCollection",
            "features": station_features
        }

        # Save to disk
        try:
            with open(lines_file, "w", encoding="utf-8") as f:
                json.dump(lines_geojson, f)
            with open(stations_file, "w", encoding="utf-8") as f:
                json.dump(stations_geojson, f)
        except Exception as e:
            print(f"[NetworkService] Error saving GeoJSON to disk: {e}")

        _CACHED_LINES_GEOJSON = lines_geojson
        _CACHED_STATIONS_GEOJSON = stations_geojson

        return lines_geojson, stations_geojson


def get_metro_lines_geojson() -> Dict[str, Any]:
    global _CACHED_LINES_GEOJSON
    if _CACHED_LINES_GEOJSON is None:
        lines, _ = generate_metro_geojson()
        return lines
    return _CACHED_LINES_GEOJSON


def get_metro_stations_geojson() -> Dict[str, Any]:
    global _CACHED_STATIONS_GEOJSON
    if _CACHED_STATIONS_GEOJSON is None:
        _, stations = generate_metro_geojson()
        return stations
    return _CACHED_STATIONS_GEOJSON


def get_all_routes_metadata() -> List[Dict[str, Any]]:
    lines = get_metro_lines_geojson()
    unique_routes = {}
    for f in lines.get("features", []):
        props = f.get("properties", {})
        r_name = props.get("route_short_name")
        if r_name and r_name not in unique_routes:
            unique_routes[r_name] = {
                "route_id": props.get("route_id"),
                "route_short_name": r_name,
                "route_long_name": props.get("route_long_name"),
                "color": props.get("color"),
                "group": props.get("line_group"),
                "mode": props.get("mode")
            }
    return list(unique_routes.values())
