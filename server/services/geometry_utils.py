import math
from typing import Dict, List, Optional, Tuple

from directional_routing.directional_routing import calculate_bearing, haversine

Point = Tuple[float, float]  # (lon, lat)

METERS_PER_DEGREE_LAT = 110540.0
METERS_PER_DEGREE_LON_AT_EQUATOR = 111320.0


def _segment_length_km(a: Point, b: Point) -> float:
    return haversine(a[1], a[0], b[1], b[0])


def project_point_to_polyline(point: Point, polyline: List[Point]) -> Optional[Dict]:
    """
    Finds the nearest point on `polyline` (list of [lon, lat], length >= 2) to
    `point`. Returns None if the polyline is too short to have a segment.

    Returns {"point": (lon, lat), "arc_length_km": float, "bearing_deg": float} -
    the snapped coordinate, its cumulative distance along the polyline from
    polyline[0], and the local direction of travel at that point (the winning
    segment's bearing), used to orient a vehicle riding along it.
    """
    if len(polyline) < 2:
        return None

    best: Optional[Tuple[float, float, Point, float]] = None
    cumulative_km = 0.0

    for i in range(len(polyline) - 1):
        a = polyline[i]
        b = polyline[i + 1]
        seg_len_km = _segment_length_km(a, b)

        # Local flat-earth meter frame referenced at `a` for this segment only -
        # segments are short (sub-km for GTFS shapes), so this avoids the
        # cumulative distortion a single global frame would introduce.
        lat0_rad = math.radians(a[1])
        meters_per_deg_lon = METERS_PER_DEGREE_LON_AT_EQUATOR * math.cos(lat0_rad)

        bx = (b[0] - a[0]) * meters_per_deg_lon
        by = (b[1] - a[1]) * METERS_PER_DEGREE_LAT
        pxm = (point[0] - a[0]) * meters_per_deg_lon
        pym = (point[1] - a[1]) * METERS_PER_DEGREE_LAT

        seg_len_m_sq = bx * bx + by * by
        if seg_len_m_sq == 0:
            t = 0.0
        else:
            t = (pxm * bx + pym * by) / seg_len_m_sq
            t = max(0.0, min(1.0, t))

        cand_lon = a[0] + (t * bx) / meters_per_deg_lon if meters_per_deg_lon else a[0]
        cand_lat = a[1] + (t * by) / METERS_PER_DEGREE_LAT

        dist_km = haversine(point[1], point[0], cand_lat, cand_lon)

        if best is None or dist_km < best[0]:
            arc_length_km = cumulative_km + t * seg_len_km
            bearing_deg = calculate_bearing(a[1], a[0], b[1], b[0])
            best = (dist_km, arc_length_km, (cand_lon, cand_lat), bearing_deg)

        cumulative_km += seg_len_km

    if best is None:
        return None

    _, arc_length_km, snapped_point, bearing_deg = best
    return {"point": snapped_point, "arc_length_km": arc_length_km, "bearing_deg": bearing_deg}


def point_at_arc_length(polyline: List[Point], target_km: float) -> Optional[Dict]:
    """
    Inverse of project_point_to_polyline: walks `polyline`'s cumulative segment
    lengths and returns the point (and local bearing) at `target_km` along it.
    Clamps target_km to [0, total_length]. Returns None if the polyline is too
    short to have a segment.
    """
    if len(polyline) < 2:
        return None

    segment_lengths_km = [
        _segment_length_km(polyline[i], polyline[i + 1]) for i in range(len(polyline) - 1)
    ]
    total_km = sum(segment_lengths_km)
    target_km = max(0.0, min(total_km, target_km))

    cumulative_km = 0.0
    for i, seg_len_km in enumerate(segment_lengths_km):
        is_last_segment = i == len(segment_lengths_km) - 1
        if target_km <= cumulative_km + seg_len_km or is_last_segment:
            a = polyline[i]
            b = polyline[i + 1]
            t = 0.0 if seg_len_km == 0 else (target_km - cumulative_km) / seg_len_km
            t = max(0.0, min(1.0, t))
            lon = a[0] + (b[0] - a[0]) * t
            lat = a[1] + (b[1] - a[1]) * t
            bearing_deg = calculate_bearing(a[1], a[0], b[1], b[0])
            return {"point": (lon, lat), "bearing_deg": bearing_deg}
        cumulative_km += seg_len_km

    return None
