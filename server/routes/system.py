import os
import time
import sqlite3
from fastapi import APIRouter
from server.models.schemas import SystemStatus
from directional_routing import DB_NAME
from server.services.spatial_service import get_spatial_tree_status

router = APIRouter(prefix="/api", tags=["System"])
_SERVER_BOOT_TIME = time.time()


@router.get("/health")
def health_check():
    """Liveness check endpoint. Returns immediately when server is not in cold starting."""
    uptime = round(time.time() - _SERVER_BOOT_TIME, 2)
    tree_status = get_spatial_tree_status()
    db_exists = os.path.exists(DB_NAME) and os.path.getsize(DB_NAME) > 0
    
    return {
        "status": "ok",
        "service": "Motion Transit Engine API",
        "uptime_seconds": uptime,
        "cold_starting": False,
        "kdtree_in_memory": tree_status.get("is_in_memory", False),
        "db_loaded": db_exists
    }


@router.get("/status", response_model=SystemStatus)
def get_system_status():
    """
    Returns verified diagnostics for:
    1. Server Up (Not Cold Starting)
    2. In-Memory KDTree Spatial Index
    3. Precomputed Timetable Database (transit & transfer edges)
    """
    uptime = round(time.time() - _SERVER_BOOT_TIME, 2)
    tree_status = get_spatial_tree_status()
    db_exists = os.path.exists(DB_NAME) and os.path.getsize(DB_NAME) > 0
    
    stops_count = 0
    routes_count = 0
    transit_edges_count = 0
    transfer_edges_count = 0

    if db_exists:
        try:
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            
            if "stops" in tables:
                stops_count = c.execute("SELECT COUNT(*) FROM stops").fetchone()[0]
            if "routes" in tables:
                routes_count = c.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
            if "transit_network_edges" in tables:
                transit_edges_count = c.execute("SELECT COUNT(*) FROM transit_network_edges").fetchone()[0]
            if "transfer_edges" in tables:
                transfer_edges_count = c.execute("SELECT COUNT(*) FROM transfer_edges").fetchone()[0]
            conn.close()
        except Exception as e:
            print(f"[SystemRoute] DB query notice: {e}")

    api_key = os.getenv("PTV_API_KEY") or os.getenv("PTVOpenDataAPIKey", "")
    ptv_configured = bool(api_key and "replace_me" not in api_key.lower() and len(api_key.strip()) > 5)
    
    mapbox_token = os.getenv("PUBLIC_MAPBOX_TOKEN", "")
    mapbox_configured = bool(mapbox_token and mapbox_token.startswith("pk.") and len(mapbox_token.strip()) > 20)

    db_loaded = stops_count > 0 and (transit_edges_count > 0 or transfer_edges_count > 0)

    checks = {
        "1_server_up": {
            "status": "pass",
            "message": "Render backend is awake and actively accepting requests",
            "uptime_seconds": uptime
        },
        "2_kdtree_in_memory": {
            "status": "pass" if tree_status.get("is_in_memory") else "warn",
            "message": "In-memory spatial KDTree ready for sub-millisecond lookup" if tree_status.get("is_in_memory") else "Spatial KDTree pending initialization",
            "total_nodes": tree_status.get("total_nodes", 0),
            "kdtree_ready": tree_status.get("kdtree_ready", False),
            "load_time_ms": tree_status.get("load_time_ms", 0.0)
        },
        "3_precomputed_database_loaded": {
            "status": "pass" if db_loaded else "fail",
            "message": "Precomputed timetable & transfer database loaded" if db_loaded else "Database missing or precomputation edges not generated",
            "db_exists": db_exists,
            "stops_count": stops_count,
            "routes_count": routes_count,
            "transit_edges_count": transit_edges_count,
            "transfer_edges_count": transfer_edges_count
        },
        "4_ptv_realtime_api": {
            "status": "pass" if ptv_configured else "warn",
            "message": "Live PTV GTFS-R Disruption API Active" if ptv_configured else "PTV API key not configured (using simulated disruptions)",
            "configured": ptv_configured
        },
        "5_mapbox_token": {
            "status": "pass" if mapbox_configured else "info",
            "message": "Mapbox 3D Engine Token Configured" if mapbox_configured else "Mapbox token required by client for 3D tiles",
            "configured": mapbox_configured
        }
    }

    return SystemStatus(
        status="ready" if (db_loaded and tree_status.get("is_in_memory")) else "initializing",
        server_online=True,
        uptime_seconds=uptime,
        kdtree_in_memory=tree_status.get("is_in_memory", False),
        kdtree_nodes_count=tree_status.get("total_nodes", 0),
        db_path=DB_NAME,
        db_exists=db_exists,
        db_loaded=db_loaded,
        stops_count=stops_count,
        routes_count=routes_count,
        transit_edges_count=transit_edges_count,
        transfer_edges_count=transfer_edges_count,
        ptv_api_configured=ptv_configured,
        checks=checks
    )
