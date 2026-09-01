from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Query
from ptv_realtime import ptv_realtime

router = APIRouter(prefix="/api/disruptions", tags=["Disruptions & Alerts"])


@router.get("/live")
def get_live_disruptions(
    window_mins: int = Query(60, ge=5, le=360, description="Active time window filter in minutes")
) -> List[Dict[str, Any]]:
    """
    Fetches and parses live PTV GTFS-Realtime service alerts across Trains, Trams, and Buses.
    """
    now = datetime.now()
    try:
        alerts = ptv_realtime.fetch_live_service_alerts(
            target_arrival_dt=now,
            lookback_window_mins=window_mins
        )
        return alerts
    except Exception as e:
        print(f"[DisruptionsRoute] Error fetching live alerts: {e}")
        return []
