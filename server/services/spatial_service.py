import os
import math
import sqlite3
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from directional_routing import DB_NAME, haversine, walking_time_mins

try:
    from scipy.spatial import KDTree
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

_STOP_IDS: List[str] = []
_STOP_METADATA: Dict[str, Dict[str, Any]] = {}
_KDTREE_INSTANCE: Optional[Any] = None
_IS_LOADED: bool = False
_LOAD_TIME_MS: float = 0.0


def lat_lon_to_cartesian(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Converts lat/lon in degrees to Cartesian (x, y, z) on a unit sphere."""
    lat_r = np.radians(lat)
    lon_r = np.radians(lon)
    x = np.cos(lat_r) * np.cos(lon_r)
    y = np.cos(lat_r) * np.sin(lon_r)
    z = np.sin(lat_r)
    return np.column_stack((x, y, z))


def initialize_in_memory_spatial_tree() -> Dict[str, Any]:
    """Loads all stops from SQLite and builds/caches an in-memory KDTree on startup."""
    global _STOP_IDS, _STOP_METADATA, _KDTREE_INSTANCE, _IS_LOADED, _LOAD_TIME_MS
    import time
    t0 = time.perf_counter()

    if not os.path.exists(DB_NAME):
        return {
            "loaded": False,
            "error": f"Database file not found at {DB_NAME}",
            "stops_count": 0,
            "has_scipy": HAS_SCIPY,
            "kdtree_in_memory": False
        }

    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon, location_type FROM stops WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL")
        rows = c.fetchall()
        conn.close()

        if not rows:
            return {
                "loaded": False,
                "error": "No stops found in database",
                "stops_count": 0,
                "has_scipy": HAS_SCIPY,
                "kdtree_in_memory": False
            }

        _STOP_IDS = [r[0] for r in rows]
        _STOP_METADATA = {
            r[0]: {
                "stop_id": r[0],
                "stop_name": r[1],
                "stop_lat": r[2],
                "stop_lon": r[3],
                "location_type": r[4]
            }
            for r in rows
        }

        lats = np.array([r[2] for r in rows], dtype=np.float64)
        lons = np.array([r[3] for r in rows], dtype=np.float64)

        if HAS_SCIPY:
            xyz = lat_lon_to_cartesian(lats, lons)
            _KDTREE_INSTANCE = KDTree(xyz)
        else:
            _KDTREE_INSTANCE = None

        _IS_LOADED = True
        _LOAD_TIME_MS = (time.perf_counter() - t0) * 1000.0

        return {
            "loaded": True,
            "stops_count": len(_STOP_IDS),
            "kdtree_in_memory": bool(_KDTREE_INSTANCE is not None),
            "has_scipy": HAS_SCIPY,
            "load_time_ms": round(_LOAD_TIME_MS, 2)
        }
    except Exception as e:
        return {
            "loaded": False,
            "error": str(e),
            "stops_count": 0,
            "has_scipy": HAS_SCIPY,
            "kdtree_in_memory": False
        }


def get_spatial_tree_status() -> Dict[str, Any]:
    """Returns telemetry of the in-memory KDTree."""
    return {
        "is_in_memory": _IS_LOADED,
        "kdtree_ready": bool(_KDTREE_INSTANCE is not None),
        "total_nodes": len(_STOP_IDS),
        "has_scipy": HAS_SCIPY,
        "load_time_ms": round(_LOAD_TIME_MS, 2)
    }
