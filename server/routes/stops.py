import sqlite3
from typing import List
from fastapi import APIRouter, Query
from server.models.schemas import StopSearchResult
from directional_routing import DB_NAME, haversine, walking_time_mins
import geocoding

router = APIRouter(prefix="/api/stops", tags=["Stops & Locations"])


@router.get("/search", response_model=List[StopSearchResult])
def search_stops(
    q: str = Query(..., min_length=1, description="Search query for station, stop, or landmark"),
    limit: int = Query(10, ge=1, le=50, description="Max results")
):
    """
    Searches GTFS transit stops, curated landmarks, and live OpenStreetMap
    Nominatim geocoding.
    """
    places = geocoding.search(q, limit=limit, db_path=DB_NAME)
    return [StopSearchResult(**vars(p)) for p in places]


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
