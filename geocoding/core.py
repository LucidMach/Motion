"""Deep search/geocode module: one interface for autocomplete search, free-text
geocoding, and stop-id coordinate resolution. Nominatim is the source of truth;
the GTFS stops table and the curated landmark list are fast, deterministic
paths checked first, for the things neither GTFS nor Nominatim can be relied
on to have (colloquial nicknames) or that GTFS already answers exactly
(known transit stops).
"""

import re
import sqlite3
from dataclasses import dataclass
from typing import List, Optional, Tuple

from . import landmarks
from .adapter import GeocodingAdapter, live_adapter


@dataclass
class Place:
    stop_id: str
    stop_name: str
    stop_lat: float
    stop_lon: float
    street_name: Optional[str] = None
    mode: str = "Address / Location"


def _default_db_path() -> str:
    from directional_routing import DB_NAME
    return DB_NAME


def _classify_gtfs_stop(stop_name: str) -> str:
    lower = stop_name.lower()
    if "station" in lower or "railway" in lower:
        return "Train Station"
    if "tram" in lower:
        return "Tram Stop"
    if "bus" in lower or "interchange" in lower:
        return "Bus Stop"
    if "/" in stop_name:
        return "Tram Stop" if "St" in stop_name or "Rd" in stop_name else "Transit Stop"
    return "Transit Stop"


def _strip_house_number(raw_name: str) -> str:
    cleaned = re.sub(r'^\d+[\w/-]*\s+', '', raw_name).strip()
    return cleaned if cleaned else raw_name


def _split_display_name(stop_name: str) -> Tuple[str, Optional[str]]:
    """Splits GTFS-style "Stop 7 - RMIT/Swanston St (City)" into (display, street)."""
    if "/" in stop_name:
        parts = stop_name.split("/", 1)
        return parts[0].strip(), parts[1].strip().replace("(", "").replace(")", "")
    return stop_name, None


def _classify_osm_place(item: dict) -> str:
    category = item.get("category", "")
    type_ = item.get("type", "")
    if type_ in ("station", "halt") or (category == "railway" and type_ != "tram_stop"):
        return "Train Station"
    if type_ in ("tram_stop", "tram") or category == "tram":
        return "Tram Stop"
    if type_ in ("bus_stop", "bus_station", "platform") or category == "bus":
        return "Bus Stop"
    if type_ in ("ferry_terminal", "ferry"):
        return "Ferry Terminal"
    if type_ in ("university", "college", "school") or category in ("education", "campus"):
        return "Campus / Landmark"
    if category in ("amenity", "building", "tourism", "leisure", "office", "shop"):
        return "Building / Landmark"
    if type_ == "administrative" or category == "boundary":
        return "Suburb / Region"
    return "Address / Location"


def _osm_place_to_place(item: dict, fallback_name: str) -> Optional[Place]:
    try:
        lat = float(item.get("lat"))
        lon = float(item.get("lon"))
    except (TypeError, ValueError):
        return None

    addr = item.get("address", {}) or {}
    raw_name = item.get("name") or addr.get("building") or addr.get("amenity")
    if not raw_name:
        parts = [p.strip() for p in item.get("display_name", "").split(",") if p.strip()]
        raw_name = parts[0] if parts else fallback_name

    road = addr.get("road") or addr.get("pedestrian") or addr.get("street") or ""
    suburb = addr.get("suburb") or addr.get("neighbourhood") or addr.get("city") or addr.get("town") or ""
    street_parts = [p for p in [road, suburb] if p]

    return Place(
        stop_id=f"osm:{item.get('osm_type', 'node')}:{item.get('osm_id', '')}",
        stop_name=_strip_house_number(raw_name),
        street_name=", ".join(street_parts) if street_parts else None,
        stop_lat=lat,
        stop_lon=lon,
        mode=_classify_osm_place(item),
    )


def search(
    query: str,
    limit: int = 10,
    db_path: Optional[str] = None,
    adapter: Optional[GeocodingAdapter] = None,
) -> List[Place]:
    """Ranked autocomplete search: GTFS stops, then curated landmarks, then
    Nominatim fills any remaining slots. Duplicate names are dropped, first
    source wins."""
    db_path = db_path or _default_db_path()
    adapter = adapter or live_adapter

    results: List[Place] = []
    seen = set()

    try:
        conn = sqlite3.connect(db_path)
        try:
            c = conn.cursor()
            c.execute(
                """
                SELECT stop_id, stop_name, stop_lat, stop_lon
                FROM stops
                WHERE stop_name LIKE ?
                ORDER BY
                    CASE WHEN stop_name LIKE ? THEN 0 ELSE 1 END,
                    LENGTH(stop_name) ASC
                LIMIT ?
                """,
                (f"%{query}%", f"{query}%", limit),
            )
            for stop_id, stop_name, lat, lon in c.fetchall():
                if lat is None or lon is None:
                    continue
                display_name, street = _split_display_name(stop_name)
                key = display_name.lower().replace(" railway station", "").replace(" station", "")
                if key in seen:
                    continue
                seen.add(key)
                results.append(Place(
                    stop_id=stop_id,
                    stop_name=display_name,
                    street_name=street,
                    stop_lat=float(lat),
                    stop_lon=float(lon),
                    mode=_classify_gtfs_stop(stop_name),
                ))
                if len(results) >= limit:
                    break
        finally:
            conn.close()
    except sqlite3.Error:
        pass

    if len(results) < limit:
        for lm in landmarks.search(query):
            key = lm.names[0]
            if key in seen:
                continue
            seen.add(key)
            results.append(Place(
                stop_id=f"landmark:{lm.names[0].replace(' ', '_')}",
                stop_name=lm.names[0].title(),
                street_name=lm.street,
                stop_lat=lm.lat,
                stop_lon=lm.lon,
                mode=lm.mode,
            ))
            if len(results) >= limit:
                break

    if len(results) < limit:
        for item in adapter.search_places(query, limit=limit - len(results)):
            place = _osm_place_to_place(item, fallback_name=query)
            if not place:
                continue
            key = place.stop_name.lower()
            if key in seen:
                continue
            seen.add(key)
            results.append(place)
            if len(results) >= limit:
                break

    return results[:limit]


def resolve_stop_coords(stop_id: str, db_path: Optional[str] = None) -> Optional[Tuple[float, float]]:
    """Authoritative GTFS coordinate lookup by stop_id. Never touches Nominatim
    or fuzzy name matching - a stop's coordinates are exact in the schedule
    data, so there is nothing to geocode."""
    db_path = db_path or _default_db_path()
    try:
        conn = sqlite3.connect(db_path)
        try:
            c = conn.cursor()
            c.execute("SELECT stop_lat, stop_lon FROM stops WHERE stop_id = ?", (stop_id,))
            row = c.fetchone()
        finally:
            conn.close()
        if row and row[0] is not None and row[1] is not None:
            return float(row[0]), float(row[1])
    except sqlite3.Error:
        pass
    return None


def geocode_address(
    address: str,
    db_path: Optional[str] = None,
    adapter: Optional[GeocodingAdapter] = None,
) -> Optional[Tuple[float, float]]:
    """Resolves free text - an address, a landmark name, or a station name
    typed by a user - to coordinates. Checked in order: curated landmarks,
    the GTFS stops table, then Nominatim as the source of truth for anything
    in neither."""
    db_path = db_path or _default_db_path()
    adapter = adapter or live_adapter
    norm = address.strip().lower()

    lm = landmarks.find(norm)
    if lm:
        return lm.lat, lm.lon

    try:
        conn = sqlite3.connect(db_path)
        try:
            c = conn.cursor()
            c.execute(
                "SELECT stop_lat, stop_lon FROM stops WHERE stop_name LIKE ? ORDER BY LENGTH(stop_name) ASC LIMIT 1",
                (f"%{address}%",),
            )
            row = c.fetchone()
        finally:
            conn.close()
        if row and row[0] is not None and row[1] is not None:
            return float(row[0]), float(row[1])
    except sqlite3.Error:
        pass

    for variant in (
        f"{address}, Victoria, Australia",
        f"{address}, Melbourne, Victoria, Australia",
        address,
        f"{address}, Australia",
    ):
        matches = adapter.search_places(variant, limit=1)
        if matches:
            try:
                return float(matches[0]["lat"]), float(matches[0]["lon"])
            except (KeyError, TypeError, ValueError):
                continue
    return None
