import os
import sys
import time
import json
import requests
from typing import Dict, Any, List, Optional, Tuple

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from google.transit import gtfs_realtime_pb2
from directional_routing.directional_routing import calculate_bearing
from server.services.geometry_utils import project_point_to_polyline, slice_polyline_by_arc_length
from server.services.network_service import GEOJSON_DIR

PTV_VEHICLE_POSITION_URLS = {
    "train": "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/metro/vehicle-positions",
    "tram": "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/vehicle-positions",
    "bus": "https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/bus/vehicle-positions",
}

STATUS_NAMES = {
    0: "INCOMING_AT",
    1: "STOPPED_AT",
    2: "IN_TRANSIT_TO",
}

# Static route and shape lookups (lazy-loaded from public/data/transit)
_CACHED_ROUTE_META_BY_ID: Optional[Dict[str, Dict[str, Any]]] = None
_CACHED_SHAPES_BY_ROUTE: Optional[Dict[str, List[List[float]]]] = None


def _get_api_key(explicit_key: Optional[str] = None) -> Optional[str]:
    if explicit_key is not None:
        return explicit_key if explicit_key else None
    key = os.getenv("PTV_API_KEY") or os.getenv("PTVOpenDataAPIKey")
    if not key:
        env_path = os.path.join(PROJECT_ROOT, ".env")
        if os.path.exists(env_path):
            try:
                import dotenv
                dotenv.load_dotenv(env_path)
                key = os.getenv("PTV_API_KEY") or os.getenv("PTVOpenDataAPIKey")
            except Exception:
                pass
    return key


def _load_route_lookups():
    global _CACHED_ROUTE_META_BY_ID, _CACHED_SHAPES_BY_ROUTE
    if _CACHED_ROUTE_META_BY_ID is not None and _CACHED_SHAPES_BY_ROUTE is not None:
        return

    routes_file = os.path.join(GEOJSON_DIR, "routes.json")
    shapes_file = os.path.join(GEOJSON_DIR, "route_shapes.geojson")

    route_meta = {}
    if os.path.exists(routes_file):
        try:
            with open(routes_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                for mode, r_list in data.items():
                    for r in r_list:
                        r_id = r.get("route_id") or r.get("route_short_name")
                        route_meta[r_id] = r
                        route_meta[r.get("route_short_name")] = r
        except Exception as e:
            print(f"[LiveVehicleService] Error loading routes.json: {e}")

    shapes_by_route = {}
    if os.path.exists(shapes_file):
        try:
            with open(shapes_file, "r", encoding="utf-8") as f:
                fc = json.load(f)
                for feat in fc.get("features", []):
                    r_name = feat.get("properties", {}).get("route_short_name")
                    coords = feat.get("geometry", {}).get("coordinates")
                    if r_name and coords and r_name not in shapes_by_route:
                        shapes_by_route[r_name] = coords
        except Exception as e:
            print(f"[LiveVehicleService] Error loading route_shapes.geojson: {e}")

    _CACHED_ROUTE_META_BY_ID = route_meta
    _CACHED_SHAPES_BY_ROUTE = shapes_by_route


def fetch_raw_gtfsr_feed(mode: str, api_key: str, timeout: int = 4) -> bytes:
    """Fetches binary protobuf payload from PTV Open Data API."""
    url = PTV_VEHICLE_POSITION_URLS.get(mode)
    if not url:
        raise ValueError(f"Unknown transit mode for GTFS-R: {mode}")

    headers = {"KeyID": api_key}
    response = requests.get(url, headers=headers, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"PTV API error {response.status_code}: {response.text[:200]}")
    if response.content.startswith((b"<!DOCTYPE html", b"<html", b"<!doctype")):
        raise RuntimeError("PTV API returned HTML error page instead of protobuf")

    return response.content


def parse_vehicle_positions_feed(raw_content: bytes, mode: str) -> List[Dict[str, Any]]:
    """Decodes binary FeedMessage into structured vehicle telemetry dictionaries."""
    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw_content)

    vehicles = []
    for entity in feed.entity:
        if not entity.HasField("vehicle"):
            continue
        vp = entity.vehicle
        pos = vp.position
        if not pos or pos.latitude == 0.0 or pos.longitude == 0.0:
            continue

        trip_id = vp.trip.trip_id or entity.id
        route_id = vp.trip.route_id or ""
        bearing = round(float(pos.bearing), 2) if pos.HasField("bearing") else 0.0
        speed_ms = float(pos.speed) if pos.HasField("speed") else 0.0
        speed_kmh = round(speed_ms * 3.6, 1)

        raw_status = vp.current_status if vp.HasField("current_status") else 2
        status_str = STATUS_NAMES.get(raw_status, "IN_TRANSIT_TO")
        is_stopped = raw_status == 1 or speed_kmh < 2.0
        stop_seq = vp.current_stop_sequence if vp.HasField("current_stop_sequence") else None

        vehicles.append({
            "vehicle_id": vp.vehicle.id or entity.id,
            "trip_id": trip_id,
            "route_id": route_id,
            "lat": round(float(pos.latitude), 6),
            "lon": round(float(pos.longitude), 6),
            "bearing_deg": bearing,
            "speed_kmh": speed_kmh,
            "status": status_str,
            "is_stopped": is_stopped,
            "current_stop_sequence": stop_seq,
            "mode": mode,
        })

    return vehicles


def snap_vehicle_position(
    lat: float, lon: float, polyline: List[List[float]]
) -> Tuple[float, float, float]:
    """
    Projects raw GPS coordinates onto physical track polyline to eliminate GPS jitter.
    Returns (snapped_lat, snapped_lon, bearing_deg).
    """
    if not polyline or len(polyline) < 2:
        return lat, lon, 0.0

    try:
        proj = project_point_to_polyline((lon, lat), [(p[0], p[1]) for p in polyline])
        if not proj:
            return lat, lon, 0.0

        snapped_lon, snapped_lat = proj["point"]
        bearing = proj.get("bearing_deg", 0.0)

        return snapped_lat, snapped_lon, bearing
    except Exception:
        return lat, lon, 0.0


class LiveVehicleService:
    def __init__(self, ttl_seconds: int = 25):
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[str, Dict[str, Any]] = {}

    def clear_cache(self):
        self._cache.clear()

    def get_vehicles(self, mode: str = "all", api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        api_key = _get_api_key(api_key)
        if not api_key:
            return []

        _load_route_lookups()
        route_meta = _CACHED_ROUTE_META_BY_ID or {}
        shapes = _CACHED_SHAPES_BY_ROUTE or {}

        modes_to_fetch = ["train", "tram", "bus"] if mode == "all" else [mode]
        now = time.time()
        combined_vehicles: List[Dict[str, Any]] = []

        for m in modes_to_fetch:
            cached = self._cache.get(m)
            if cached and (now - cached["timestamp"]) < self.ttl_seconds:
                combined_vehicles.extend(cached["vehicles"])
                continue

            try:
                raw_pb = fetch_raw_gtfsr_feed(m, api_key=api_key)
                parsed = parse_vehicle_positions_feed(raw_pb, mode=m)

                # Enrich and snap
                enriched = []
                for v in parsed:
                    r_info = route_meta.get(v["route_id"]) or route_meta.get(v.get("route_short_name", "")) or {}
                    short_name = r_info.get("route_short_name") or v["route_id"]
                    color = r_info.get("color", "#0072CE" if m == "train" else "#78BE20" if m == "tram" else "#FF8200")

                    # Snap to polyline if available
                    polyline = shapes.get(short_name)
                    if polyline:
                        snapped_lat, snapped_lon, snapped_bearing = snap_vehicle_position(v["lat"], v["lon"], polyline)
                        v["lat"] = snapped_lat
                        v["lon"] = snapped_lon
                        if snapped_bearing != 0.0:
                            v["bearing_deg"] = snapped_bearing

                    v["route_short_name"] = short_name
                    v["route_long_name"] = r_info.get("route_long_name", f"{short_name} Line")
                    v["color"] = color

                    # Generate path forward for smooth continuous motion
                    if v.get("is_stopped"):
                        v["path"] = [[v["lon"], v["lat"]], [v["lon"], v["lat"]]]
                    else:
                        speed_kmh = v.get("speed_kmh") or (50.0 if m == "train" else 28.0 if m == "tram" else 35.0)
                        step_secs = 4
                        dist_km = (speed_kmh / 3600.0) * step_secs
                        v_path = None
                        if polyline and len(polyline) >= 2:
                            try:
                                proj = project_point_to_polyline((v["lon"], v["lat"]), polyline)
                                if proj:
                                    cur_km = proj["arc_length_km"]
                                    bearing = v.get("bearing_deg", 0.0)
                                    shape_bearing = proj.get("bearing_deg", 0.0)
                                    diff = abs(((bearing - shape_bearing + 180) % 360) - 180)
                                    direction = -1 if diff > 90 else 1
                                    next_km = cur_km + direction * dist_km
                                    sliced = slice_polyline_by_arc_length(polyline, cur_km, next_km)
                                    if len(sliced) >= 2:
                                        v_path = [[p[0], p[1]] for p in sliced]
                            except Exception:
                                v_path = None
                        if not v_path:
                            import math
                            bearing_rad = math.radians(v.get("bearing_deg", 0.0))
                            meters = (speed_kmh / 3.6) * step_secs
                            meters_per_deg_lon = 111320 * math.cos(math.radians(v["lat"]))
                            next_lon = v["lon"] + (meters * math.sin(bearing_rad)) / meters_per_deg_lon
                            next_lat = v["lat"] + (meters * math.cos(bearing_rad)) / 111320
                            v_path = [[v["lon"], v["lat"]], [round(next_lon, 6), round(next_lat, 6)]]
                        v["path"] = v_path

                    enriched.append(v)

                self._cache[m] = {"timestamp": now, "vehicles": enriched}
                combined_vehicles.extend(enriched)
            except Exception as e:
                # Log warning and return whatever stale cache exists or empty
                print(f"[LiveVehicleService] Failed fetching {m} GTFS-R feed: {e}")
                if cached:
                    combined_vehicles.extend(cached["vehicles"])

        return combined_vehicles

    def get_vehicles_geojson(self, mode: str = "all", api_key: Optional[str] = None) -> Dict[str, Any]:
        key = _get_api_key(api_key)
        if not key:
            return {
                "type": "FeatureCollection",
                "features": [],
                "telemetry": {
                    "ptv_feed": "offline",
                    "reason": "PTV API key not configured",
                    "cached_timestamp": 0,
                    "vehicles_count": 0,
                }
            }

        try:
            vehicles = self.get_vehicles(mode=mode, api_key=key)
            if not vehicles:
                return {
                    "type": "FeatureCollection",
                    "features": [],
                    "telemetry": {
                        "ptv_feed": "offline",
                        "reason": "No live vehicles returned from GTFS-R feed",
                        "cached_timestamp": time.time(),
                        "vehicles_count": 0,
                    }
                }

            features = []
            for v in vehicles:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [v["lon"], v["lat"]]
                    },
                    "properties": {
                        "trip_id": v["trip_id"],
                        "vehicle_id": v.get("vehicle_id"),
                        "route_short_name": v.get("route_short_name"),
                        "route_long_name": v.get("route_long_name"),
                        "mode": v["mode"],
                        "color": v.get("color"),
                        "bearing_deg": v.get("bearing_deg", 0.0),
                        "speed_kmh": v.get("speed_kmh", 0.0),
                        "status": v.get("status"),
                        "is_stopped": v.get("is_stopped", False),
                        "current_stop_sequence": v.get("current_stop_sequence"),
                        "destination": v.get("destination"),
                        "path": v.get("path"),
                    }
                })

            return {
                "type": "FeatureCollection",
                "features": features,
                "telemetry": {
                    "ptv_feed": "online",
                    "vehicles_count": len(features),
                    "timestamp": time.time(),
                }
            }
        except Exception as e:
            return {
                "type": "FeatureCollection",
                "features": [],
                "telemetry": {
                    "ptv_feed": "offline",
                    "reason": str(e),
                    "timestamp": time.time(),
                }
            }


_GLOBAL_LIVE_VEHICLE_SERVICE = LiveVehicleService(ttl_seconds=25)


def get_live_vehicles_data(mode: str = "all", api_key: Optional[str] = None) -> List[Dict[str, Any]]:
    return _GLOBAL_LIVE_VEHICLE_SERVICE.get_vehicles(mode=mode, api_key=api_key)


def get_live_vehicles_geojson(mode: str = "all", api_key: Optional[str] = None) -> Dict[str, Any]:
    return _GLOBAL_LIVE_VEHICLE_SERVICE.get_vehicles_geojson(mode=mode, api_key=api_key)


def clear_vehicle_cache():
    _GLOBAL_LIVE_VEHICLE_SERVICE.clear_cache()
