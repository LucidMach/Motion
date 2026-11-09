import math
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def resolve_db_path(db_path):
    if db_path == ':memory:' or os.path.exists(db_path):
        return db_path
    root_path = os.path.join(PROJECT_ROOT, db_path)
    if os.path.exists(root_path):
        return root_path
    return db_path

DB_NAME = resolve_db_path('gtfs_schedule.db')
WALKING_SPEED_KMH = 5.0

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculates the bearing from point 1 to point 2."""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    diff_long = math.radians(lon2 - lon1)

    x = math.sin(diff_long) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - (math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(diff_long))

    initial_bearing = math.atan2(x, y)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    return compass_bearing

def walking_time_mins(distance_km):
    return (distance_km / WALKING_SPEED_KMH) * 60.0

def get_mode_name(route_type):
    """Maps GTFS and extended GTFS route types to human-readable transit mode names."""
    if route_type is None:
        return 'Transit'
    try:
        rt = int(route_type)
    except (ValueError, TypeError):
        return 'Transit'

    if rt == 0 or (900 <= rt <= 999):
        return 'Tram'
    elif rt in (1, 2) or (100 <= rt <= 199) or (400 <= rt <= 499):
        return 'Train'
    elif rt == 3 or (200 <= rt <= 299) or (700 <= rt <= 899):
        return 'Bus'
    elif rt == 4 or (1000 <= rt <= 1099):
        return 'Ferry'
    elif rt == 5:
        return 'Cable Tram'
    elif rt == 6:
        return 'Gondola'
    elif rt == 7:
        return 'Funicular'
    return 'Transit'
