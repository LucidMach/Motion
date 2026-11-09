# Technical Specification: Shared Geo Utilities

## Overview
`directional_routing.py` holds small geo/GTFS primitives shared across the backend: the resolved path to the GTFS SQLite database, and a handful of distance/bearing/mode-name helpers. It no longer contains a routing engine - the point-to-point itinerary calculator that previously lived here (bi-directional Dijkstra pathfinding, disruption-aware graph construction, backward timetable rehydration) was removed along with the point-to-point navigation feature.

---

## Core API & Function Reference

| Symbol | Description |
| :--- | :--- |
| `DB_NAME` | Resolved filesystem path to `gtfs_schedule.db`, used as the default `db_path` by callers across `server/`. |
| `WALKING_SPEED_KMH` | Assumed pedestrian walking velocity (km/h), used by `walking_time_mins`. |
| `haversine(lat1, lon1, lat2, lon2) -> float` | Great-circle distance in kilometers. |
| `calculate_bearing(lat1, lon1, lat2, lon2) -> float` | Forward compass azimuth in degrees ($0^{\circ}-360^{\circ}$). |
| `walking_time_mins(distance_km) -> float` | Converts pedestrian distance to minutes at `WALKING_SPEED_KMH`. |
| `get_mode_name(route_type) -> str` | Maps GTFS standard (0=Tram, 1/2=Train, 3=Bus, 4=Ferry) and extended Hierarchical Route Type (HVT) codes into readable mode labels. |

---

## Consumers

- `server/routes/system.py`, `server/routes/stops.py`, `server/services/spatial_service.py`, `server/services/route_shape_service.py` - `DB_NAME`.
- `server/routes/stops.py`, `server/services/spatial_service.py` - `haversine`, `walking_time_mins`.
- `server/services/geometry_utils.py`, `server/services/train_simulation_service.py` - `calculate_bearing` (imported from the `directional_routing.directional_routing` submodule directly).
- `server/services/route_shape_service.py` - `get_mode_name`.
- `ptv_realtime/ptv_realtime.py` - `DB_NAME`, as the default `db_path` for live-alert lookups.
