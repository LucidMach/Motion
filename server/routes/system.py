import os
import sqlite3
from fastapi import APIRouter
from server.models.schemas import SystemStatus
from directional_routing import DB_NAME

router = APIRouter(prefix="/api", tags=["System"])


@router.get("/health")
def health_check():
    """Liveness check endpoint."""
    return {"status": "ok", "service": "Motion Transit Engine API"}


@router.get("/status", response_model=SystemStatus)
def get_system_status():
    """Returns database telemetry, stop counts, and precomputed edge counts."""
    db_exists = os.path.exists(DB_NAME)
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
    ptv_configured = bool(api_key and "replace_me" not in api_key.lower())

    return SystemStatus(
        status="ready" if db_exists else "needs_database",
        db_path=DB_NAME,
        db_exists=db_exists,
        stops_count=stops_count,
        routes_count=routes_count,
        transit_edges_count=transit_edges_count,
        transfer_edges_count=transfer_edges_count,
        ptv_api_configured=ptv_configured
    )
