from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field


class RouteRequest(BaseModel):
    origin: str = Field(..., description="Origin address, landmark name, or 'lat,lon' string")
    destination: str = Field(..., description="Destination address, landmark name, or 'lat,lon' string")
    arrival_time: Optional[str] = Field(
        None,
        description="Target arrival time in 'HH:MM' (24-hr) or 'YYYY-MM-DD HH:MM' format"
    )
    arrival_timestamp: Optional[int] = Field(
        None,
        description="Target arrival time as Unix epoch seconds"
    )
    buffer_minutes: int = Field(
        5,
        ge=0,
        le=60,
        description="Safety buffer in minutes subtracted from departure"
    )
    disruptions: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="List of custom disruption objects"
    )
    cancelled_routes: Optional[List[str]] = Field(
        None,
        description="Simulate cancelled routes (e.g. ['Sandringham'])"
    )
    cancelled_trips: Optional[List[str]] = Field(
        None,
        description="Simulate cancelled trip IDs"
    )
    prefer_replacement_bus: bool = Field(
        True,
        description="Whether to prefer rail replacement bus injection when rail is disrupted"
    )
    fetch_live_alerts: bool = Field(
        True,
        description="Whether to query live PTV GTFS-R alerts"
    )


class RouteLeg(BaseModel):
    type: str = Field(..., description="Type of leg: WALK, TRANSIT, TRANSFER, REPLACEMENT_BUS")
    mode: str = Field(..., description="Transit mode (e.g. Metro Train, Tram, Walking)")
    route: Optional[str] = Field(None, description="Route or line short name")
    from_stop: Optional[str] = Field(None, description="Departure stop name")
    to_stop: Optional[str] = Field(None, description="Arrival stop name")
    start_time: str = Field(..., description="Leg departure time (HH:MM)")
    end_time: str = Field(..., description="Leg arrival time (HH:MM)")
    duration_mins: float = Field(..., description="Leg travel time in minutes")
    distance_km: Optional[float] = Field(None, description="Distance in kilometers")
    instruction: str = Field(..., description="Human-readable turn-by-turn instruction")
    trip_id: Optional[str] = Field(None, description="Trip identifier")
    is_replacement: Optional[bool] = Field(False, description="Whether this leg is a replacement bus")
    color: Optional[str] = Field(None, description="Hex color code for transit line visualization on map")
    coordinates: Optional[List[List[float]]] = Field(
        None,
        description="Coordinates for map polyline path [[lon, lat], ...]"
    )


class RouteResponse(BaseModel):
    status: str = Field(..., description="'Success' or 'Error'")
    message: Optional[str] = None
    origin: Optional[str] = None
    origin_coords: Optional[List[float]] = Field(None, description="[latitude, longitude]")
    destination: Optional[str] = None
    destination_coords: Optional[List[float]] = Field(None, description="[latitude, longitude]")
    target_arrival_time: Optional[str] = None
    target_arrival_epoch: Optional[int] = None
    latest_departure_time: Optional[str] = None
    recommended_departure_time: Optional[str] = None
    total_travel_time_mins: Optional[float] = None
    safety_buffer_mins: int = 5
    realtime_delay_mins: float = 0.0
    transfers_count: int = 0
    modes_summary: Optional[str] = None
    replacement_buses_used: bool = False
    computation_time_secs: Optional[float] = None
    legs: List[RouteLeg] = []
    route_nodes: List[str] = []
    disruptions_detected: List[Dict[str, Any]] = []


class StopSearchResult(BaseModel):
    stop_id: str
    stop_name: str
    street_name: Optional[str] = None
    stop_lat: float
    stop_lon: float
    distance_km: Optional[float] = None
    walk_time_mins: Optional[float] = None
    mode: Optional[str] = "Transit"


class LiveDisruptionItem(BaseModel):
    id: str
    mode: str
    route_name: Optional[str] = None
    route_id: Optional[str] = None
    header: str
    description: str
    effect: str
    severity: str
    start_epoch: Optional[int] = None
    end_epoch: Optional[int] = None


class SystemStatus(BaseModel):
    status: str
    db_path: str
    db_exists: bool
    stops_count: int
    routes_count: int
    transit_edges_count: int
    transfer_edges_count: int
    ptv_api_configured: bool
