from typing import Dict, Any, List
from fastapi import APIRouter
from server.services.network_service import (
    get_metro_lines_geojson,
    get_metro_stations_geojson,
    get_all_routes_metadata,
    generate_metro_geojson
)
from server.services.train_simulation_service import get_active_train_positions_geojson

router = APIRouter(prefix="/api/network", tags=["Network & Geometries"])


@router.get("/metro/lines")
def get_metro_lines() -> Dict[str, Any]:
    """
    Returns GeoJSON FeatureCollection of all Melbourne Metro Train line track geometries.
    """
    return get_metro_lines_geojson()


@router.get("/metro/stations")
def get_metro_stations() -> Dict[str, Any]:
    """
    Returns GeoJSON FeatureCollection of all Metro train stations with interchange flags.
    """
    return get_metro_stations_geojson()


@router.get("/routes")
def get_routes() -> List[Dict[str, Any]]:
    """
    Returns list of all available train routes with their PTV hex color codes and line groups.
    """
    return get_all_routes_metadata()


@router.get("/trains/live")
def get_live_trains() -> Dict[str, Any]:
    """
    Returns GeoJSON FeatureCollection of every Metro train currently in service,
    with positions simulated by interpolating the static GTFS timetable against
    the current time (no live GPS feed involved yet).
    """
    return get_active_train_positions_geojson()


@router.post("/metro/regenerate")
def regenerate_geojson():
    """
    Forces regeneration and caching of GeoJSON datasets from the GTFS zip archive.
    """
    lines, stations = generate_metro_geojson()
    return {
        "status": "success",
        "lines_count": len(lines.get("features", [])),
        "stations_count": len(stations.get("features", []))
    }
