import sqlite3
from typing import List, Optional
from fastapi import APIRouter, Query
from server.models.schemas import StopSearchResult
from directional_routing import DB_NAME, KNOWN_LOCATIONS, haversine, walking_time_mins

router = APIRouter(prefix="/api/stops", tags=["Stops & Locations"])


import json
import urllib.parse
import urllib.request


import re


def clean_building_title(raw_name: str) -> str:
    """Removes leading house numbers from landmark/building names."""
    cleaned = re.sub(r'^\d+[\w/-]*\s+', '', raw_name).strip()
    return cleaned if cleaned else raw_name


def search_nominatim_live(query: str, limit: int = 5) -> List[StopSearchResult]:
    """
    Live dynamic geocoding via OpenStreetMap Nominatim service bounded to Victoria, Australia.
    """
    results: List[StopSearchResult] = []
    try:
        url = (
            f"https://nominatim.openstreetmap.org/search?"
            f"q={urllib.parse.quote(query)}"
            f"&format=jsonv2&addressdetails=1&limit={limit}"
            f"&countrycodes=au&viewbox=140.9,-39.2,150.0,-33.9"
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Motion-Transit-App/1.0 (https://github.com/lucidmach/Motion)"}
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, list):
                for item in data:
                    try:
                        lat = float(item.get("lat", 0))
                        lon = float(item.get("lon", 0))
                        cat = item.get("category", "")
                        type_ = item.get("type", "")
                        addr = item.get("address", {})

                        if type_ in ("station", "halt") or (cat == "railway" and type_ != "tram_stop"):
                            mode = "Train Station"
                        elif type_ in ("tram_stop", "tram") or cat == "tram":
                            mode = "Tram Stop"
                        elif type_ in ("bus_stop", "bus_station", "platform") or cat == "bus":
                            mode = "Bus Stop"
                        elif type_ in ("ferry_terminal", "ferry"):
                            mode = "Ferry Terminal"
                        elif type_ in ("university", "college", "school") or cat in ("education", "campus"):
                            mode = "Campus / Landmark"
                        elif cat in ("amenity", "building", "tourism", "leisure", "office", "shop"):
                            mode = "Building / Landmark"
                        elif type_ == "administrative" or cat == "boundary":
                            mode = "Suburb / Region"
                        else:
                            mode = "Address / Location"

                        # Building / Landmark name without house numbers
                        raw_name = item.get("name") or addr.get("building") or addr.get("amenity")
                        if not raw_name:
                            raw_display = item.get("display_name", "")
                            parts = [p.strip() for p in raw_display.split(",") if p.strip()]
                            raw_name = parts[0] if parts else query

                        building_name = clean_building_title(raw_name)

                        # Street name + suburb
                        road = addr.get("road") or addr.get("pedestrian") or addr.get("street") or ""
                        suburb = addr.get("suburb") or addr.get("neighbourhood") or addr.get("city") or addr.get("town") or ""
                        street_parts = [p for p in [road, suburb] if p]
                        street_name = ", ".join(street_parts) if street_parts else None

                        results.append(StopSearchResult(
                            stop_id=f"osm:{item.get('osm_type', 'node')}:{item.get('osm_id', '')}",
                            stop_name=building_name,
                            street_name=street_name,
                            stop_lat=lat,
                            stop_lon=lon,
                            mode=mode
                        ))
                    except Exception:
                        continue
    except Exception as e:
        # Graceful fallback on network timeout/offline
        pass
    return results


@router.get("/search", response_model=List[StopSearchResult])
def search_stops(
    q: str = Query(..., min_length=1, description="Search query for station, stop, or landmark"),
    limit: int = Query(10, ge=1, le=50, description="Max results")
):
    """
    Searches GTFS transit stops, known landmarks, and live OpenStreetMap Nominatim geocoding.
    """
    results: List[StopSearchResult] = []
    seen_names = set()
    norm_q = q.strip().lower()

    # Landmark street directory
    LANDMARK_STREETS = {
        'the spot building': '198 Berkeley Street, Carlton',
        'the spot': '198 Berkeley Street, Carlton',
        'alan finkel building': 'Alliance Lane, Monash Clayton',
        'monash university': 'Wellington Road, Clayton',
        'monash university clayton': 'Wellington Road, Clayton',
        'university of melbourne': 'Grattan Street, Parkville',
        'unimelb': 'Grattan Street, Parkville',
        'rmit university': 'Swanston & La Trobe St, Melbourne CBD',
        'rmit': 'Swanston & La Trobe St, Melbourne CBD',
        'melbourne cricket ground': 'Brunton Avenue, East Melbourne',
        'mcg': 'Brunton Avenue, East Melbourne',
        'marvel stadium': 'Harbour Esplanade, Docklands',
        'queen victoria market': 'Elizabeth & Victoria St, Melbourne',
        'crown melbourne': '8 Whiteman Street, Southbank',
        'flinders street station': 'Swanston & Flinders St, Melbourne CBD',
        'flinders street': 'Swanston & Flinders St, Melbourne CBD',
        'southern cross station': 'Spencer & Collins St, Melbourne CBD',
        'southern cross': 'Spencer & Collins St, Melbourne CBD',
        'melbourne central station': 'Swanston & La Trobe St, Melbourne CBD',
        'melbourne central': 'Swanston & La Trobe St, Melbourne CBD',
        'richmond station': 'Swan Street, Richmond',
        'richmond': 'Swan Street, Richmond',
        'footscray station': 'Irving Street, Footscray',
        'footscray': 'Irving Street, Footscray',
        'parliament station': 'Spring & Bourke St, Melbourne CBD',
        'parliament': 'Spring & Bourke St, Melbourne CBD',
        'flagstaff station': 'William & La Trobe St, Melbourne CBD',
        'flagstaff': 'William & La Trobe St, Melbourne CBD',
        'st kilda beach': 'The Esplanade, St Kilda',
        'st kilda': 'The Esplanade, St Kilda',
    }

    # 1. Match database GTFS stops with specific transit modes
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("""
            SELECT stop_id, stop_name, stop_lat, stop_lon 
            FROM stops 
            WHERE stop_name LIKE ? 
            ORDER BY 
                CASE WHEN stop_name LIKE ? THEN 0 ELSE 1 END,
                LENGTH(stop_name) ASC 
            LIMIT ?
        """, (f"%{q}%", f"{q}%", limit))

        for row in c.fetchall():
            s_id, s_name, s_lat, s_lon = row
            if s_lat is not None and s_lon is not None:
                # Classify transit stop type specifically
                lower_s = s_name.lower()
                if "station" in lower_s or "railway" in lower_s:
                    mode_label = "Train Station"
                elif "tram" in lower_s:
                    mode_label = "Tram Stop"
                elif "bus" in lower_s or "interchange" in lower_s:
                    mode_label = "Bus Stop"
                elif "/" in s_name:
                    mode_label = "Tram Stop" if "St" in s_name or "Rd" in s_name else "Transit Stop"
                else:
                    mode_label = "Transit Stop"

                # Parse street info if present in GTFS stop_name (e.g. "Stop 7 - RMIT/Swanston St (City)")
                street_info = None
                display_name = s_name
                if "/" in s_name:
                    parts = s_name.split("/", 1)
                    display_name = parts[0].strip()
                    street_info = parts[1].strip().replace("(", "").replace(")", "")

                clean_key = display_name.lower().replace(" railway station", "").replace(" station", "")
                if clean_key not in seen_names:
                    seen_names.add(clean_key)
                    results.append(StopSearchResult(
                        stop_id=s_id,
                        stop_name=display_name,
                        street_name=street_info,
                        stop_lat=float(s_lat),
                        stop_lon=float(s_lon),
                        mode=mode_label
                    ))
            if len(results) >= limit:
                break
        conn.close()
    except Exception as e:
        print(f"[StopsRoute] Search query note: {e}")

    # 2. Match known landmarks fast dictionary
    for name, (lat, lon) in KNOWN_LOCATIONS.items():
        if norm_q in name:
            title = clean_building_title(name.title())
            is_station = "station" in name or name in {"flinders street", "southern cross", "richmond", "footscray", "parliament", "flagstaff"}
            mode = "Train Station" if is_station else "Building / Landmark"
            street = LANDMARK_STREETS.get(name)

            if title.lower() not in seen_names:
                seen_names.add(title.lower())
                results.append(StopSearchResult(
                    stop_id=f"landmark:{name.replace(' ', '_')}",
                    stop_name=title,
                    street_name=street,
                    stop_lat=lat,
                    stop_lon=lon,
                    mode=mode
                ))

    # 3. Live Dynamic Geocoding via OpenStreetMap Nominatim
    if len(results) < limit:
        osm_matches = search_nominatim_live(q, limit=limit - len(results))
        for item in osm_matches:
            clean_osm_key = item.stop_name.lower()
            if clean_osm_key not in seen_names:
                seen_names.add(clean_osm_key)
                results.append(item)
            if len(results) >= limit:
                break

    return results[:limit]


@router.get("/nearby", response_model=List[StopSearchResult])
def get_nearby_stops(
    lat: float = Query(..., description="Latitude of user/location"),
    lon: float = Query(..., description="Longitude of user/location"),
    radius_km: float = Query(1.5, ge=0.1, le=10.0, description="Search radius in km"),
    limit: int = Query(10, ge=1, le=50, description="Max results")
):
    """
    Finds stops within given radius of coordinates, sorted by walking distance.
    """
    results = []
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops")

        candidates = []
        for row in c.fetchall():
            s_id, s_name, s_lat, s_lon = row
            if s_lat is not None and s_lon is not None:
                dist = haversine(lat, lon, s_lat, s_lon)
                if dist <= radius_km:
                    candidates.append({
                        "stop_id": s_id,
                        "stop_name": s_name.replace(" Railway Station", "").replace(" Station", ""),
                        "stop_lat": float(s_lat),
                        "stop_lon": float(s_lon),
                        "distance_km": round(dist, 2),
                        "walk_time_mins": round(walking_time_mins(dist), 1),
                        "mode": "Transit Stop"
                    })
        conn.close()

        candidates.sort(key=lambda x: x["distance_km"])
        for item in candidates[:limit]:
            results.append(StopSearchResult(**item))
    except Exception as e:
        print(f"[StopsRoute] Nearby query note: {e}")

    return results
