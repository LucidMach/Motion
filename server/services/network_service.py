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
# Official PTV Metro Line Colors
LINE_METADATA = {
    # Dark Blue: Burnley Group
    "Alamein": {"color": "#152C6B", "group": "Burnley Group", "text_color": "#FFFFFF"},
    "Belgrave": {"color": "#152C6B", "group": "Burnley Group", "text_color": "#FFFFFF"},
    "Lilydale": {"color": "#152C6B", "group": "Burnley Group", "text_color": "#FFFFFF"},
    "Glen Waverley": {"color": "#152C6B", "group": "Burnley Group", "text_color": "#FFFFFF"},
    # Red: Clifton Hill Group
    "Hurstbridge": {"color": "#BE1014", "group": "Clifton Hill Group", "text_color": "#FFFFFF"},
    "Mernda": {"color": "#BE1014", "group": "Clifton Hill Group", "text_color": "#FFFFFF"},
    # Yellow: Northern Group
    "Craigieburn": {"color": "#FFBE00", "group": "Northern Group", "text_color": "#000000"},
    "Upfield": {"color": "#FFBE00", "group": "Northern Group", "text_color": "#000000"},
    # Green: Frankston Line (with Stony Point shuttle)
    "Frankston": {"color": "#028430", "group": "Frankston Line", "text_color": "#FFFFFF"},
    "Stony Point": {"color": "#028430", "group": "Frankston Line", "text_color": "#028430", "outline": True, "shuttle": True},
    # Pink: Sandringham, Werribee, Williamstown (Cross-City)
    "Sandringham": {"color": "#F178AF", "group": "Cross-City Group", "text_color": "#FFFFFF"},
    "Werribee": {"color": "#F178AF", "group": "Cross-City Group", "text_color": "#FFFFFF"},
    "Williamstown": {"color": "#F178AF", "group": "Cross-City Group", "text_color": "#FFFFFF"},
    # City Loop Group (Blue): Cranbourne, Pakenham, Sunbury
    "Cranbourne": {"color": "#0072CE", "group": "City Loop Group", "text_color": "#FFFFFF"},
    "Pakenham": {"color": "#0072CE", "group": "City Loop Group", "text_color": "#FFFFFF"},
    "Sunbury": {"color": "#0072CE", "group": "City Loop Group", "text_color": "#FFFFFF"},
    # Special / Inactive
    "Flemington Racecourse": {"color": "#95979A", "group": "Special Events", "text_color": "#000000"},
    "City Circle": {"color": "#0072CE", "group": "City Loop", "text_color": "#FFFFFF"},
}

# Curated fallback for official PTV Yarra Tram routes and line colors
FALLBACK_TRAM_METADATA: Dict[str, Dict[str, str]] = {
    "1": {"color": "#B5BD00", "text_color": "#000000", "route_long_name": "South Melbourne Beach - East Coburg"},
    "3": {"color": "#8DC8E8", "text_color": "#000000", "route_long_name": "East Malvern - Melbourne University"},
    "5": {"color": "#D50032", "text_color": "#FFFFFF", "route_long_name": "Malvern - Melbourne University"},
    "6": {"color": "#01426A", "text_color": "#FFFFFF", "route_long_name": "Glen Iris - Moreland"},
    "11": {"color": "#6ECEB2", "text_color": "#000000", "route_long_name": "Victoria Harbour Docklands - West Preston"},
    "12": {"color": "#007E92", "text_color": "#FFFFFF", "route_long_name": "St Kilda (Fitzroy St) - Victoria Gardens"},
    "16": {"color": "#FBD872", "text_color": "#000000", "route_long_name": "Kew - Melbourne University"},
    "19": {"color": "#8A1B61", "text_color": "#FFFFFF", "route_long_name": "Flinders Street Station - North Coburg"},
    "30": {"color": "#534F96", "text_color": "#FFFFFF", "route_long_name": "Central Pier Docklands - St Vincents Plaza"},
    "35": {"color": "#6B3529", "text_color": "#FFFFFF", "route_long_name": "City Circle"},
    "48": {"color": "#333434", "text_color": "#FFFFFF", "route_long_name": "Victoria Harbour Docklands - North Balwyn"},
    "57": {"color": "#00C1D5", "text_color": "#000000", "route_long_name": "Flinders Street Station - West Maribyrnong"},
    "58": {"color": "#969696", "text_color": "#FFFFFF", "route_long_name": "Toorak - West Coburg"},
    "59": {"color": "#00653A", "text_color": "#FFFFFF", "route_long_name": "Flinders Street Station - Airport West"},
    "64": {"color": "#00AB8E", "text_color": "#FFFFFF", "route_long_name": "East Brighton - Melbourne University"},
    "67": {"color": "#956C58", "text_color": "#FFFFFF", "route_long_name": "Carnegie - Melbourne University"},
    "70": {"color": "#F59BBB", "text_color": "#000000", "route_long_name": "Waterfront City Docklands - Wattle Park"},
    "72": {"color": "#9ABEAA", "text_color": "#000000", "route_long_name": "Camberwell - Melbourne University"},
    "75": {"color": "#00A9E0", "text_color": "#000000", "route_long_name": "Central Pier Docklands - Vermont South"},
    "78": {"color": "#A0A0D6", "text_color": "#000000", "route_long_name": "Balaclava - North Richmond"},
    "82": {"color": "#D2D755", "text_color": "#000000", "route_long_name": "Moonee Ponds - Footscray"},
    "86": {"color": "#FFB500", "text_color": "#000000", "route_long_name": "Waterfront City Docklands - Bundoora RMIT"},
    "96": {"color": "#C6007E", "text_color": "#FFFFFF", "route_long_name": "St Kilda Beach - East Brunswick"},
    "109": {"color": "#E87722", "text_color": "#000000", "route_long_name": "Port Melbourne - Box Hill"},
}

_CACHED_LINES_GEOJSON: Optional[Dict[str, Any]] = None
_CACHED_STATIONS_GEOJSON: Optional[Dict[str, Any]] = None
_CACHED_TRIP_SHAPE_MAP: Optional[Dict[str, str]] = None
_CACHED_TRAM_METADATA: Optional[Dict[str, Dict[str, Any]]] = None
_CACHED_TRAM_LINES_GEOJSON: Optional[Dict[str, Any]] = None
_CACHED_TRAM_TRIP_SHAPE_MAP: Optional[Dict[str, str]] = None


def get_tram_routes_metadata(force: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Fetches official PTV tram route metadata and line colors directly from GTFS Feed 3
    (gtfs/3/google_transit.zip). Falls back to FALLBACK_TRAM_METADATA if the GTFS zip is unavailable.
    """
    global _CACHED_TRAM_METADATA
    if not force and _CACHED_TRAM_METADATA is not None:
        return _CACHED_TRAM_METADATA

    zip_path = os.path.join(PROJECT_ROOT, "gtfs", "3", "google_transit.zip")
    tram_meta: Dict[str, Dict[str, Any]] = {}

    if os.path.exists(zip_path):
        try:
            with zipfile.ZipFile(zip_path, "r") as z:
                if "routes.txt" in z.namelist():
                    with z.open("routes.txt") as f:
                        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
                        for r in reader:
                            short_name = r.get("route_short_name", "").strip()
                            if not short_name:
                                continue
                            raw_color = r.get("route_color", "").strip()
                            raw_text = r.get("route_text_color", "").strip()
                            hex_color = f"#{raw_color}" if raw_color else "#78BE20"
                            text_color = f"#{raw_text}" if raw_text else "#FFFFFF"
                            tram_meta[short_name] = {
                                "route_id": r.get("route_id", short_name),
                                "route_short_name": short_name,
                                "route_long_name": r.get("route_long_name", ""),
                                "color": hex_color,
                                "text_color": text_color,
                                "group": "Yarra Trams",
                                "mode": "tram",
                            }
        except Exception as e:
            print(f"[NetworkService] Warning loading tram metadata from {zip_path}: {e}")

    # Fallback to curated official PTV colors for any route missing from zip
    for short_name, fallback in FALLBACK_TRAM_METADATA.items():
        if short_name not in tram_meta:
            tram_meta[short_name] = {
                "route_id": short_name,
                "route_short_name": short_name,
                "route_long_name": fallback["route_long_name"],
                "color": fallback["color"],
                "text_color": fallback.get("text_color", "#FFFFFF"),
                "group": "Yarra Trams",
                "mode": "tram",
            }

    _CACHED_TRAM_METADATA = tram_meta
    return _CACHED_TRAM_METADATA


def get_tram_route_color(route_name: Optional[str]) -> str:
    """
    Resolves official hex color for a given tram route name or number,
    falling back to PTV Tram Green #78BE20 if unresolved.
    """
    if not route_name:
        return "#78BE20"
    r = route_name.strip()
    tram_meta = get_tram_routes_metadata()
    if r in tram_meta:
        return tram_meta[r]["color"]

    clean = r.lower().replace("route", "").replace("tram", "").strip()
    if clean in tram_meta:
        return tram_meta[clean]["color"]

    import re
    match = re.search(r"\b(109|96|86|82|78|75|72|70|67|64|59|58|57|48|35|30|19|16|12|11|6|5|3|1)\b", r)
    if match and match.group(1) in tram_meta:
        return tram_meta[match.group(1)]["color"]

    return "#78BE20"

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


def _resolve_line_color(short_name: str, zip_color: str) -> str:
    """Curated LINE_METADATA wins when present - the GTFS zip's own route_color
    field is sometimes wrong (e.g. it duplicates Sandringham's pink for Werribee)
    and is only trustworthy as a fallback for lines we haven't curated."""
    curated = LINE_METADATA.get(short_name, {}).get("color")
    if curated:
        return curated
    return f"#{zip_color}" if zip_color else "#0072CE"


def ensure_geojson_dir():
    os.makedirs(GEOJSON_DIR, exist_ok=True)


def generate_metro_geojson(force: bool = False) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Extracts high-precision train shapes, routes, and stations from GTFS Feed 2 (gtfs/2/google_transit.zip).
    Returns (lines_geojson, stations_geojson). Pass force=True to bypass the
    disk cache and always re-parse the zip (used by POST /metro/regenerate -
    without this, "regenerating" was a no-op whenever cache files already existed).
    """
    global _CACHED_LINES_GEOJSON, _CACHED_STATIONS_GEOJSON, _CACHED_TRIP_SHAPE_MAP

    lines_file = os.path.join(GEOJSON_DIR, "ptv_metro_trains.geojson")
    stations_file = os.path.join(GEOJSON_DIR, "ptv_metro_stations.geojson")
    trip_shape_file = os.path.join(GEOJSON_DIR, "ptv_trip_shape_map.json")

    # If cached files already exist on disk, load and cache in memory
    if not force and os.path.exists(lines_file) and os.path.exists(stations_file) and os.path.exists(trip_shape_file):
        try:
            with open(lines_file, "r", encoding="utf-8") as f:
                _CACHED_LINES_GEOJSON = json.load(f)
            with open(stations_file, "r", encoding="utf-8") as f:
                _CACHED_STATIONS_GEOJSON = json.load(f)
            with open(trip_shape_file, "r", encoding="utf-8") as f:
                _CACHED_TRIP_SHAPE_MAP = json.load(f)
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
                if not s_name or s_name in ("Replacement Bus", "City Circle", "Flemington Racecourse"):
                    continue
                color = r.get("route_color", "")
                hex_color = _resolve_line_color(s_name, color)
                meta = LINE_METADATA.get(s_name, {})
                routes[r_id] = {
                    "route_id": r_id,
                    "route_short_name": s_name,
                    "route_long_name": r.get("route_long_name", ""),
                    "color": hex_color,
                    "group": meta.get("group", "Metro Network"),
                    "outline": meta.get("outline", False),
                    "shuttle": meta.get("shuttle", False),
                }

        # 2. Map trip shape IDs to routes, and trip_id -> shape_id (the latter
        # lets a live train's trip_id be resolved to its exact rail alignment
        # for position/bearing snapping - see train_simulation_service.py)
        shape_to_route = {}
        trip_to_shape: Dict[str, str] = {}
        with z.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for t in reader:
                r_id = t["route_id"]
                s_id = t.get("shape_id")
                trip_id = t.get("trip_id")
                if s_id and trip_id:
                    trip_to_shape[trip_id] = s_id
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
                    "outline": route_meta.get("outline", False),
                    "shuttle": route_meta.get("shuttle", False),
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
            with open(trip_shape_file, "w", encoding="utf-8") as f:
                json.dump(trip_to_shape, f)
        except Exception as e:
            print(f"[NetworkService] Error saving GeoJSON to disk: {e}")

        _CACHED_LINES_GEOJSON = lines_geojson
        _CACHED_STATIONS_GEOJSON = stations_geojson
        _CACHED_TRIP_SHAPE_MAP = trip_to_shape

        return lines_geojson, stations_geojson


def get_metro_lines_geojson() -> Dict[str, Any]:
    global _CACHED_LINES_GEOJSON
    if _CACHED_LINES_GEOJSON is None:
        lines, _ = generate_metro_geojson()
        return lines
    return _CACHED_LINES_GEOJSON


def get_trip_shape_map() -> Dict[str, str]:
    """trip_id -> shape_id, for resolving a live train's exact rail alignment."""
    global _CACHED_TRIP_SHAPE_MAP
    if _CACHED_TRIP_SHAPE_MAP is None:
        generate_metro_geojson()
    return _CACHED_TRIP_SHAPE_MAP or {}


def get_shape_polylines() -> Dict[str, List[List[float]]]:
    """shape_id -> ordered [lon, lat] polyline, derived from the cached metro
    lines GeoJSON - cheap enough to recompute per call rather than caching
    separately, which keeps it impossible to go stale on its own."""
    lines = get_metro_lines_geojson()
    return {
        f["properties"]["shape_id"]: f["geometry"]["coordinates"]
        for f in lines.get("features", [])
        if f.get("properties", {}).get("shape_id") and f.get("geometry", {}).get("type") == "LineString"
    }


def generate_tram_geojson(force: bool = False) -> tuple[Dict[str, Any], Dict[str, str]]:
    """
    Extracts high-precision tram shapes and trip mappings from GTFS Feed 3 (gtfs/3/google_transit.zip).
    Returns (tram_lines_geojson, tram_trip_shape_map).
    """
    global _CACHED_TRAM_LINES_GEOJSON, _CACHED_TRAM_TRIP_SHAPE_MAP

    lines_file = os.path.join(GEOJSON_DIR, "ptv_tram_lines.geojson")
    trip_shape_file = os.path.join(GEOJSON_DIR, "ptv_tram_trip_shape_map.json")

    if not force and os.path.exists(lines_file) and os.path.exists(trip_shape_file):
        try:
            with open(lines_file, "r", encoding="utf-8") as f:
                _CACHED_TRAM_LINES_GEOJSON = json.load(f)
            with open(trip_shape_file, "r", encoding="utf-8") as f:
                _CACHED_TRAM_TRIP_SHAPE_MAP = json.load(f)
            if _CACHED_TRAM_LINES_GEOJSON and _CACHED_TRAM_TRIP_SHAPE_MAP:
                return _CACHED_TRAM_LINES_GEOJSON, _CACHED_TRAM_TRIP_SHAPE_MAP
        except Exception as e:
            print(f"[NetworkService] Warning reading cached Tram GeoJSON files: {e}")

    zip_path = os.path.join(PROJECT_ROOT, "gtfs", "3", "google_transit.zip")
    if not os.path.exists(zip_path):
        empty_fc = {"type": "FeatureCollection", "features": []}
        return empty_fc, {}

    ensure_geojson_dir()

    with zipfile.ZipFile(zip_path, "r") as z:
        routes = {}
        with z.open("routes.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for r in reader:
                r_id = r["route_id"]
                s_name = r.get("route_short_name", "")
                c = get_tram_route_color(s_name)
                routes[r_id] = {
                    "route_id": r_id,
                    "route_short_name": s_name,
                    "route_long_name": r.get("route_long_name", ""),
                    "color": c,
                    "group": "Yarra Trams",
                }

        shape_to_route = {}
        trip_to_shape: Dict[str, str] = {}
        with z.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for t in reader:
                r_id = t["route_id"]
                s_id = t.get("shape_id")
                trip_id = t.get("trip_id")
                if s_id and trip_id:
                    trip_to_shape[trip_id] = s_id
                if s_id and r_id in routes:
                    if s_id not in shape_to_route:
                        shape_to_route[s_id] = routes[r_id]

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

        features = []
        for s_id, pts in shapes_coords.items():
            pts.sort(key=lambda x: x[0])
            coords = [[lon, lat] for _, lon, lat in pts]
            route_meta = shape_to_route[s_id]
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords,
                },
                "properties": {
                    "shape_id": s_id,
                    "route_id": route_meta["route_id"],
                    "route_short_name": route_meta["route_short_name"],
                    "route_long_name": route_meta["route_long_name"],
                    "line_name": f"Route {route_meta['route_short_name']} Tram",
                    "color": route_meta["color"],
                    "line_group": "Yarra Trams",
                    "mode": "Tram",
                    "mode_code": "tram",
                },
            })

        tram_lines_geojson = {"type": "FeatureCollection", "features": features}

        try:
            with open(lines_file, "w", encoding="utf-8") as f:
                json.dump(tram_lines_geojson, f)
            with open(trip_shape_file, "w", encoding="utf-8") as f:
                json.dump(trip_to_shape, f)
        except Exception as e:
            print(f"[NetworkService] Error saving Tram GeoJSON to disk: {e}")

        _CACHED_TRAM_LINES_GEOJSON = tram_lines_geojson
        _CACHED_TRAM_TRIP_SHAPE_MAP = trip_to_shape
        return tram_lines_geojson, trip_to_shape


def get_tram_lines_geojson() -> Dict[str, Any]:
    global _CACHED_TRAM_LINES_GEOJSON
    if _CACHED_TRAM_LINES_GEOJSON is None:
        lines, _ = generate_tram_geojson()
        return lines
    return _CACHED_TRAM_LINES_GEOJSON


def get_tram_trip_shape_map() -> Dict[str, str]:
    global _CACHED_TRAM_TRIP_SHAPE_MAP
    if _CACHED_TRAM_TRIP_SHAPE_MAP is None:
        generate_tram_geojson()
    return _CACHED_TRAM_TRIP_SHAPE_MAP or {}


def get_tram_shape_polylines() -> Dict[str, List[List[float]]]:
    lines = get_tram_lines_geojson()
    return {
        f["properties"]["shape_id"]: f["geometry"]["coordinates"]
        for f in lines.get("features", [])
        if f.get("properties", {}).get("shape_id") and f.get("geometry", {}).get("type") == "LineString"
    }


def get_all_trip_shape_map() -> Dict[str, str]:
    """Combines train and tram trip_id -> shape_id mappings."""
    train_map = get_trip_shape_map()
    tram_map = get_tram_trip_shape_map()
    merged = dict(train_map)
    merged.update(tram_map)
    return merged


def get_all_shape_polylines() -> Dict[str, List[List[float]]]:
    """Combines train and tram shape_id -> ordered [lon, lat] polylines."""
    train_shapes = get_shape_polylines()
    tram_shapes = get_tram_shape_polylines()
    merged = dict(train_shapes)
    merged.update(tram_shapes)
    return merged



def get_metro_stations_geojson() -> Dict[str, Any]:
    global _CACHED_STATIONS_GEOJSON
    if _CACHED_STATIONS_GEOJSON is None:
        _, stations = generate_metro_geojson()
        return stations
    return _CACHED_STATIONS_GEOJSON


# Standard PTV Melbourne Railway corridor sequence
TRAIN_CORRIDOR_ORDER: List[str] = [
    # City Loop Group (Blue)
    "Cranbourne", "Pakenham", "Sunbury",
    # Burnley Group (Dark Blue)
    "Lilydale", "Belgrave", "Glen Waverley", "Alamein",
    # Northern Group (Yellow)
    "Craigieburn", "Upfield",
    # Clifton Hill Group (Red)
    "Mernda", "Hurstbridge",
    # Frankston Line (Green)
    "Frankston",
    # Cross-City Group (Pink)
    "Werribee", "Sandringham", "Williamstown",
]

EXCLUDED_TRAIN_LINES = {
    "City Circle",
    "Replacement Bus",
    "Flemington Racecourse",
    "Williamstown",
    "Stony Point",
}


def get_all_routes_metadata() -> List[Dict[str, Any]]:
    lines = get_metro_lines_geojson()
    unique_routes = {}
    for f in lines.get("features", []):
        props = f.get("properties", {})
        r_name = props.get("route_short_name")
        if r_name and r_name not in unique_routes and r_name not in EXCLUDED_TRAIN_LINES:
            meta = LINE_METADATA.get(r_name, {})
            unique_routes[r_name] = {
                "route_id": props.get("route_id"),
                "route_short_name": r_name,
                "route_long_name": props.get("route_long_name"),
                "color": props.get("color") or meta.get("color"),
                "text_color": meta.get("text_color", "#FFFFFF"),
                "group": props.get("line_group") or meta.get("group"),
                "outline": props.get("outline", False) or meta.get("outline", False),
                "shuttle": props.get("shuttle", False) or meta.get("shuttle", False),
                "mode": props.get("mode", "train")
            }
    result = list(unique_routes.values())
    order_map = {name: idx for idx, name in enumerate(TRAIN_CORRIDOR_ORDER)}
    result.sort(key=lambda r: (order_map.get(r.get("route_short_name", ""), 999), r.get("route_short_name", "")))
    return result
