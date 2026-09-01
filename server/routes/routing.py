import time
from datetime import datetime, timedelta
import sqlite3
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException

from server.models.schemas import RouteRequest, RouteResponse, RouteLeg
import directional_routing
from directional_routing import DB_NAME, geocode_address, haversine
from testPTVOpenData import testPTVOpenData

router = APIRouter(prefix="/api", tags=["Routing Engine"])


def get_stop_coords(stop_name: str, db_path: str = DB_NAME) -> Optional[List[float]]:
    """Returns [lat, lon] for a stop or landmark."""
    if not stop_name:
        return None
    return geocode_address(stop_name, db_path=db_path)


@router.post("/route", response_model=RouteResponse)
def compute_route(req: RouteRequest) -> RouteResponse:
    """
    Computes optimal directional multi-modal commute itinerary backward from target arrival time,
    accounting for live/simulated disruptions, real-time delays, and safety buffers.
    """
    start_time_exec = time.time()

    # 1. Parse target arrival datetime
    if req.arrival_timestamp:
        target_arrival_dt = testPTVOpenData.parse_arrival_datetime(req.arrival_timestamp)
    elif req.arrival_time:
        target_arrival_dt = testPTVOpenData.parse_arrival_datetime(req.arrival_time)
    else:
        # Default to 45 minutes from now if unspecified
        target_arrival_dt = datetime.now() + timedelta(minutes=45)

    target_arrival_epoch = int(target_arrival_dt.timestamp())

    # 2. Collect disruptions
    all_disruptions = list(req.disruptions or [])
    if req.fetch_live_alerts and testPTVOpenData.API_KEY and not req.disruptions:
        try:
            live_alerts = testPTVOpenData.fetch_live_service_alerts(target_arrival_dt)
            if live_alerts:
                all_disruptions.extend(live_alerts)
        except Exception as e:
            print(f"[RoutingRoute] Notice fetching live alerts: {e}")

    # 3. Execute directional itinerary computation
    try:
        raw_itinerary = directional_routing.calculate_directional_itinerary(
            start_address=req.origin,
            dest_address=req.destination,
            arrival_dt=target_arrival_dt,
            disruptions=all_disruptions,
            cancelled_routes=req.cancelled_routes,
            cancelled_trips=req.cancelled_trips,
            prefer_replacement_bus=req.prefer_replacement_bus
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing algorithm error: {str(e)}")

    if raw_itinerary.get("status") != "Success":
        return RouteResponse(
            status="Error",
            message=raw_itinerary.get("message", "Route calculation could not find a valid connection.")
        )

    # 4. Check for live real-time delays or cancellations on transit legs
    real_time_delay_mins = 0
    cancelled_detected_in_realtime = []

    for leg in raw_itinerary.get("legs", []):
        if leg.get("type") == "TRANSIT" and not leg.get("is_replacement"):
            trip_id = leg.get("trip_id")
            if trip_id and trip_id != "SCHEDULED":
                delay, is_canc = testPTVOpenData.fetch_realtime_delays_and_cancellations(trip_id)
                if is_canc:
                    cancelled_detected_in_realtime.append(trip_id)
                elif delay > 0:
                    real_time_delay_mins += delay

    # 5. If live cancellation detected, recompute itinerary
    if cancelled_detected_in_realtime:
        all_cancelled_trips = list(set((req.cancelled_trips or []) + cancelled_detected_in_realtime))
        try:
            raw_itinerary = directional_routing.calculate_directional_itinerary(
                start_address=req.origin,
                dest_address=req.destination,
                arrival_dt=target_arrival_dt,
                disruptions=all_disruptions,
                cancelled_routes=req.cancelled_routes,
                cancelled_trips=all_cancelled_trips,
                prefer_replacement_bus=req.prefer_replacement_bus
            )
        except Exception:
            pass

    # 6. Format legs and attach path coordinates for Mapbox
    formatted_legs: List[RouteLeg] = []
    for leg in raw_itinerary.get("legs", []):
        from_coords = get_stop_coords(leg.get("from_stop", ""))
        to_coords = get_stop_coords(leg.get("to_stop", ""))

        leg_coords = []
        if from_coords and to_coords:
            # Mapbox expects [lon, lat]
            leg_coords = [
                [from_coords[1], from_coords[0]],
                [to_coords[1], to_coords[0]]
            ]

        formatted_legs.append(RouteLeg(
            type=leg.get("type", "TRANSIT"),
            mode=leg.get("mode", "Transit"),
            route=leg.get("route"),
            from_stop=leg.get("from_stop"),
            to_stop=leg.get("to_stop"),
            start_time=leg.get("start_time", "00:00"),
            end_time=leg.get("end_time", "00:00"),
            duration_mins=float(leg.get("duration_mins", 0)),
            distance_km=leg.get("distance_km"),
            instruction=leg.get("instruction", ""),
            trip_id=leg.get("trip_id"),
            is_replacement=leg.get("is_replacement", False),
            coordinates=leg_coords if leg_coords else None
        ))

    # 7. Calculate recommended departure timestamp with buffer and real-time delays
    latest_departure_str = raw_itinerary.get("latest_departure_time", "00:00")
    try:
        dep_hour, dep_min = map(int, latest_departure_str.split(":"))
        base_dep_dt = datetime(
            target_arrival_dt.year,
            target_arrival_dt.month,
            target_arrival_dt.day,
            dep_hour,
            dep_min,
            0
        )
        total_offset_mins = req.buffer_minutes + real_time_delay_mins
        rec_dep_dt = base_dep_dt - timedelta(minutes=total_offset_mins)
        rec_dep_str = rec_dep_dt.strftime("%H:%M")
    except Exception:
        rec_dep_str = latest_departure_str

    origin_c = get_stop_coords(req.origin)
    dest_c = get_stop_coords(req.destination)
    total_exec_secs = round(time.time() - start_time_exec, 3)

    return RouteResponse(
        status="Success",
        origin=req.origin,
        origin_coords=list(origin_c) if origin_c else None,
        destination=req.destination,
        destination_coords=list(dest_c) if dest_c else None,
        target_arrival_time=target_arrival_dt.strftime("%Y-%m-%d %H:%M"),
        target_arrival_epoch=target_arrival_epoch,
        latest_departure_time=latest_departure_str,
        recommended_departure_time=rec_dep_str,
        total_travel_time_mins=raw_itinerary.get("total_travel_time_mins"),
        safety_buffer_mins=req.buffer_minutes,
        realtime_delay_mins=float(real_time_delay_mins),
        transfers_count=raw_itinerary.get("transfers_count", 0),
        modes_summary=raw_itinerary.get("modes_summary"),
        replacement_buses_used=raw_itinerary.get("replacement_buses_used", False),
        computation_time_secs=total_exec_secs,
        legs=formatted_legs,
        route_nodes=raw_itinerary.get("route", []),
        disruptions_detected=all_disruptions
    )
