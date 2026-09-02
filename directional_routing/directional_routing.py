import sqlite3
import math
import time
from datetime import datetime, timedelta
import os
import sys
import networkx as nx
from geopy.geocoders import Nominatim

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from geocoding import geocode_address

def resolve_db_path(db_path):
    if db_path == ':memory:' or os.path.exists(db_path):
        return db_path
    root_path = os.path.join(PROJECT_ROOT, db_path)
    if os.path.exists(root_path):
        return root_path
    return db_path

DB_NAME = resolve_db_path('gtfs_schedule.db')
WALKING_SPEED_KMH = 5.0
TRANSFER_PENALTY_MINS = 7.0
REPLACEMENT_BUS_SPEED_KMH = 28.0
REPLACEMENT_BUS_DWELL_MINS = 1.0

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

def get_angle_diff(angle1, angle2):
    """Returns the absolute smallest difference between two angles (0-180)."""
    diff = abs(angle1 - angle2) % 360
    return diff if diff <= 180 else 360 - diff

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

def normalize_disruptions(disruptions=None, cancelled_routes=None, cancelled_trips=None):
    """Normalizes disruption definitions, cancelled routes, and cancelled trips into a standard structure."""
    normalized = []
    if disruptions:
        for d in disruptions:
            if isinstance(d, dict):
                normalized.append(d)
            elif isinstance(d, str):
                normalized.append({
                    "route_name": d,
                    "effect": "NO_SERVICE",
                    "replacement_bus_available": True,
                    "description": f"Service suspended on {d} line. Replacement buses operating."
                })
    if cancelled_routes:
        for r in cancelled_routes:
            normalized.append({
                "route_name": r,
                "effect": "NO_SERVICE",
                "replacement_bus_available": True,
                "description": f"Route {r} cancelled. Replacement buses operating."
            })
    return normalized

def match_disruption(route_name, from_stop_name, to_stop_name, disruptions):
    """Checks if a route segment matches any active disruption."""
    if not disruptions:
        return None
    r_norm = (route_name or '').strip().lower()
    f_norm = (from_stop_name or '').strip().lower()
    t_norm = (to_stop_name or '').strip().lower()
    
    for d in disruptions:
        d_route = d.get('route_name', '').strip().lower()
        if d_route:
            if d_route in r_norm or r_norm in d_route:
                # If specific stop corridor is defined in disruption
                d_from = d.get('from_stop', '').strip().lower()
                d_to = d.get('to_stop', '').strip().lower()
                if d_from and d_to:
                    if (d_from in f_norm or f_norm in d_from) and (d_to in t_norm or t_norm in d_to):
                        return d
                else:
                    return d
    return None

def get_directional_nearby_stops(conn, lat, lon, target_bearing=None, radius=1.5):
    """Finds walkable candidate stops within radius, sorted primarily by distance and transit accessibility."""
    c = conn.cursor()
    lat_diff = radius / 111.0
    lon_diff = radius / (111.0 * math.cos(math.radians(lat)))
    
    c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?",
              (lat - lat_diff, lat + lat_diff, lon - lon_diff, lon + lon_diff))
    
    all_stops = []
    for row in c.fetchall():
        stop_id, stop_name, stop_lat, stop_lon = row
        dist = haversine(lat, lon, stop_lat, stop_lon)
        if dist <= radius:
            bearing = calculate_bearing(lat, lon, stop_lat, stop_lon)
            angle_diff = get_angle_diff(bearing, target_bearing) if target_bearing is not None else 0
            all_stops.append({
                'stop_id': stop_id,
                'stop_name': stop_name,
                'stop_lat': stop_lat,
                'stop_lon': stop_lon,
                'distance_km': dist,
                'walk_time_mins': walking_time_mins(dist),
                'bearing': bearing,
                'angle_diff': angle_diff
            })
            
    # Sort primarily by proximity (walking distance)
    all_stops.sort(key=lambda x: x['distance_km'])
    return all_stops

def build_directional_spatial_graph(conn, origin_lat, origin_lon, dest_lat, dest_lon, 
                                   disruptions=None, cancelled_routes=None, prefer_replacement_bus=True):
    """
    Builds a spatial NetworkX corridor graph in memory.
    Dynamically prunes cancelled/disrupted transit edges and injects prioritized replacement buses.
    """
    G = nx.DiGraph()
    c = conn.cursor()
    
    normalized_disruptions = normalize_disruptions(disruptions, cancelled_routes)
    
    # 1. Macro Origin-Destination corridor bounding box with generous padding
    min_lat = min(origin_lat, dest_lat) - 0.06
    max_lat = max(origin_lat, dest_lat) + 0.06
    min_lon = min(origin_lon, dest_lon) - 0.06
    max_lon = max(origin_lon, dest_lon) + 0.06
    
    c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?", 
              (min_lat, max_lat, min_lon, max_lon))
    
    stops_in_bbox = {}
    for row in c.fetchall():
        stop_id, stop_name, stop_lat, stop_lon = row
        G.add_node(stop_id, name=stop_name, lat=stop_lat, lon=stop_lon, type='transit_stop')
        stops_in_bbox[stop_id] = {'lat': stop_lat, 'lon': stop_lon, 'name': stop_name}
        
    if not stops_in_bbox:
        return G
        
    # Check if precomputed tables exist
    has_precomputed = c.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='transit_network_edges'").fetchone()[0]
    
    if has_precomputed:
        # Load precomputed transit edges
        c.execute("SELECT from_stop_id, to_stop_id, route_type, route_short_name, avg_travel_time FROM transit_network_edges")
        for row in c.fetchall():
            u, v, route_type, route_name, avg_time = row
            if u in stops_in_bbox and v in stops_in_bbox:
                if avg_time < 0:
                    avg_time = 0
                weight = max(0.5, avg_time / 60.0)
                mode = get_mode_name(route_type)
                
                u_name = stops_in_bbox[u]['name']
                v_name = stops_in_bbox[v]['name']
                
                # Check for active disruptions or cancellations
                disruption = match_disruption(route_name, u_name, v_name, normalized_disruptions)
                
                if disruption:
                    effect = disruption.get("effect", "NO_SERVICE")
                    replacement_available = disruption.get("replacement_bus_available", True)
                    
                    if effect == "NO_SERVICE":
                        if prefer_replacement_bus and replacement_available:
                            # Recompute edge as Rail Replacement Bus
                            dist_km = haversine(stops_in_bbox[u]['lat'], stops_in_bbox[u]['lon'],
                                                stops_in_bbox[v]['lat'], stops_in_bbox[v]['lon'])
                            # Replacement bus travel time with dwell
                            rep_speed = disruption.get("replacement_speed_kmh", REPLACEMENT_BUS_SPEED_KMH)
                            rep_dwell = disruption.get("replacement_dwell_mins", REPLACEMENT_BUS_DWELL_MINS)
                            rep_travel_time = (dist_km / rep_speed) * 60.0 + rep_dwell
                            
                            # Preference bonus for organized replacement bus so Dijkstra prefers it over walking or multi-transfers
                            rep_weight = max(1.5, rep_travel_time)
                            
                            rep_mode = 'Replacement Bus'
                            rep_route = f"Replacement Bus ({route_name})"
                            
                            if G.has_edge(u, v):
                                if rep_weight < G[u][v]['weight']:
                                    G[u][v]['weight'] = rep_weight
                                    G[u][v]['mode'] = rep_mode
                                    G[u][v]['route'] = rep_route
                                    G[u][v]['is_replacement'] = True
                            else:
                                G.add_edge(u, v, weight=rep_weight, type='transit', mode=rep_mode, 
                                           route=rep_route, is_replacement=True, dist_km=dist_km)
                        else:
                            # Cancelled with no replacement bus -> Skip edge (or do not add)
                            continue
                    elif effect == "DELAYED":
                        delay_mins = disruption.get("delay_mins", 5.0)
                        weight += delay_mins
                        if G.has_edge(u, v):
                            if weight < G[u][v]['weight']:
                                G[u][v]['weight'] = weight
                                G[u][v]['mode'] = mode
                                G[u][v]['route'] = route_name
                        else:
                            G.add_edge(u, v, weight=weight, type='transit', mode=mode, route=route_name)
                    continue

                if G.has_edge(u, v):
                    if weight < G[u][v]['weight']:
                        G[u][v]['weight'] = weight
                        G[u][v]['mode'] = mode
                        G[u][v]['route'] = route_name
                        G[u][v]['is_replacement'] = False
                else:
                    G.add_edge(u, v, weight=weight, type='transit', mode=mode, route=route_name, is_replacement=False)

        # Load precomputed transfer walking edges with TRANSFER_PENALTY_MINS
        c.execute("SELECT from_stop_id, to_stop_id, distance_km, walk_time_mins FROM transfer_edges")
        for row in c.fetchall():
            u, v, dist, walk_time = row
            if u in stops_in_bbox and v in stops_in_bbox:
                # Add transfer penalty so changing lines requires significant time savings
                transfer_weight = walk_time + TRANSFER_PENALTY_MINS
                G.add_edge(u, v, weight=transfer_weight, type='walk', distance_km=dist, walk_mins=walk_time)
    else:
        print("Warning: Precomputed tables not found. Run precompute_graph.py for maximum performance.")

    return G

def get_latest_transit_leg_backward(conn, start_stop_id, end_stop_id, target_arrival_secs, 
                                    cancelled_trips=None, cancelled_routes=None, disruptions=None):
    """
    Finds the latest possible departure from start_stop that arrives at end_stop by target_arrival_secs.
    Excludes cancelled trips and routes affected by disruptions.
    """
    c = conn.cursor()
    
    cancelled_trips_set = set(cancelled_trips) if cancelled_trips else set()
    cancelled_routes_set = set(r.strip().lower() for r in cancelled_routes) if cancelled_routes else set()
    
    normalized_disruptions = normalize_disruptions(disruptions)
    for d in normalized_disruptions:
        if d.get("effect") == "NO_SERVICE" and d.get("route_name"):
            cancelled_routes_set.add(d["route_name"].strip().lower())
            
    # 1. First try exact stop_id match
    query_exact = """
    SELECT 
        st1.trip_id, 
        r.route_short_name,
        r.route_type,
        st1.departure_time_secs, 
        st2.arrival_time_secs
    FROM stop_times st1
    JOIN stop_times st2 ON st1.trip_id = st2.trip_id
    JOIN trips t ON st1.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    WHERE st1.stop_id = ?
      AND st2.stop_id = ?
      AND st1.stop_sequence < st2.stop_sequence
      AND st2.arrival_time_secs <= ?
    ORDER BY st2.arrival_time_secs DESC, st1.departure_time_secs DESC
    LIMIT 20
    """
    c.execute(query_exact, (start_stop_id, end_stop_id, target_arrival_secs))
    rows = c.fetchall()
    for row in rows:
        trip_id, r_name, r_type, dep_s, arr_s = row
        if trip_id in cancelled_trips_set:
            continue
        if r_name and r_name.strip().lower() in cancelled_routes_set:
            continue
        return {
            'trip_id': trip_id,
            'route_name': r_name,
            'mode': get_mode_name(r_type),
            'departure_secs': dep_s,
            'arrival_secs': arr_s
        }
        
    # 2. Match across all platforms of the same station/stop_name
    query_station = """
    SELECT 
        st1.trip_id, 
        r.route_short_name,
        r.route_type,
        st1.departure_time_secs, 
        st2.arrival_time_secs
    FROM stop_times st1
    JOIN stop_times st2 ON st1.trip_id = st2.trip_id
    JOIN trips t ON st1.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    WHERE st1.stop_id IN (SELECT s2.stop_id FROM stops s1 JOIN stops s2 ON s1.stop_name = s2.stop_name WHERE s1.stop_id = ?)
      AND st2.stop_id IN (SELECT s2.stop_id FROM stops s1 JOIN stops s2 ON s1.stop_name = s2.stop_name WHERE s1.stop_id = ?)
      AND st1.stop_sequence < st2.stop_sequence
      AND st2.arrival_time_secs <= ?
    ORDER BY st2.arrival_time_secs DESC, st1.departure_time_secs DESC
    LIMIT 20
    """
    c.execute(query_station, (start_stop_id, end_stop_id, target_arrival_secs))
    rows = c.fetchall()
    for row in rows:
        trip_id, r_name, r_type, dep_s, arr_s = row
        if trip_id in cancelled_trips_set:
            continue
        if r_name and r_name.strip().lower() in cancelled_routes_set:
            continue
        return {
            'trip_id': trip_id,
            'route_name': r_name,
            'mode': get_mode_name(r_type),
            'departure_secs': dep_s,
            'arrival_secs': arr_s
        }
        
    return None

def format_secs(s):
    while s < 0:
        s += 86400
    h = (s // 3600) % 24
    m = (s % 3600) // 60
    return f"{int(h):02d}:{int(m):02d}"

def calculate_directional_itinerary(start_address, dest_address, arrival_dt, db_path=DB_NAME,
                                   disruptions=None, cancelled_routes=None, cancelled_trips=None,
                                   prefer_replacement_bus=True):
    """
    Calculates a transfer-optimized multi-modal itinerary with dynamic in-memory graph recomputation
    for service cancellations and disruptions (with prioritized replacement buses).
    """
    start_perf = time.perf_counter()
    
    print(f"Geocoding {start_address}...")
    origin_coords = geocode_address(start_address, db_path=db_path)
    if not origin_coords:
        return {"status": "Error", "message": f"Could not geocode start address: {start_address}"}
    origin_lat, origin_lon = origin_coords

    print(f"Geocoding {dest_address}...")
    dest_coords = geocode_address(dest_address, db_path=db_path)
    if not dest_coords:
        return {"status": "Error", "message": f"Could not geocode dest address: {dest_address}"}
    dest_lat, dest_lon = dest_coords
        
    overall_bearing = calculate_bearing(origin_lat, origin_lon, dest_lat, dest_lon)
    target_arrival_secs = int(arrival_dt.hour * 3600 + arrival_dt.minute * 60 + arrival_dt.second)
    
    normalized_disruptions = normalize_disruptions(disruptions, cancelled_routes, cancelled_trips)
    if normalized_disruptions:
        print(f"Applying {len(normalized_disruptions)} active service disruptions to in-memory graph...")
        for d in normalized_disruptions:
            print(f"  ⚡ Disruption: {d.get('route_name', 'General')} - {d.get('description', d.get('effect', 'NO_SERVICE'))}")
            
    conn = sqlite3.connect(db_path)
    
    print("Building spatial graph...")
    G = build_directional_spatial_graph(conn, origin_lat, origin_lon, dest_lat, dest_lon,
                                        disruptions=normalized_disruptions, 
                                        cancelled_routes=cancelled_routes, 
                                        prefer_replacement_bus=prefer_replacement_bus)
    
    # Connect Origin directly to candidate stops
    G.add_node('ORIGIN', type='location', lat=origin_lat, lon=origin_lon, name=start_address)
    start_stops = get_directional_nearby_stops(conn, origin_lat, origin_lon, radius=1.5)
    connected_start = 0
    for s in start_stops:
        if s['stop_id'] in G:
            G.add_edge('ORIGIN', s['stop_id'], weight=s['walk_time_mins'], type='walk', distance_km=s['distance_km'], walk_mins=s['walk_time_mins'])
            connected_start += 1
            if connected_start >= 12:
                break
            
    # Connect Destination directly from candidate stops
    G.add_node('DESTINATION', type='location', lat=dest_lat, lon=dest_lon, name=dest_address)
    end_stops = get_directional_nearby_stops(conn, dest_lat, dest_lon, radius=1.5)
    connected_end = 0
    for s in end_stops:
        if s['stop_id'] in G:
            G.add_edge(s['stop_id'], 'DESTINATION', weight=s['walk_time_mins'], type='walk', distance_km=s['distance_km'], walk_mins=s['walk_time_mins'])
            connected_end += 1
            if connected_end >= 12:
                break

    # Connect direct walking edge if within walkable threshold
    direct_dist = haversine(origin_lat, origin_lon, dest_lat, dest_lon)
    if direct_dist <= 3.0:
        direct_walk_mins = walking_time_mins(direct_dist)
        G.add_edge('ORIGIN', 'DESTINATION', weight=direct_walk_mins, type='walk', distance_km=direct_dist, walk_mins=direct_walk_mins)
            
    if G.out_degree('ORIGIN') == 0 or G.in_degree('DESTINATION') == 0:
        conn.close()
        return {"status": "Error", "message": "No transit stops found near origin or destination within graph bounds."}
        
    print("Running Bi-directional Dijkstra...")
    try:
        path_length, path_nodes = nx.bidirectional_dijkstra(G, 'ORIGIN', 'DESTINATION', weight='weight')
    except nx.NetworkXNoPath:
        conn.close()
        return {"status": "Error", "message": "No direct transit routes found matching your destination."}

    # Group consecutive segments: walks vs continuous transit sequences
    print("Rehydrating exact timetable backwards...")
    segments = []
    i = 0
    while i < len(path_nodes) - 1:
        u = path_nodes[i]
        v = path_nodes[i+1]
        edge_data = G[u][v]
        
        if edge_data['type'] == 'walk':
            segments.append({
                'type': 'WALK',
                'from_node': u,
                'to_node': v,
                'dist_km': edge_data.get('distance_km', 0.5),
                'walk_mins': edge_data.get('walk_mins', edge_data['weight'])
            })
            i += 1
        elif edge_data['type'] == 'transit':
            t_nodes = [u, v]
            j = i + 1
            while j < len(path_nodes) - 1:
                next_u = path_nodes[j]
                next_v = path_nodes[j+1]
                if G[next_u][next_v]['type'] == 'transit':
                    t_nodes.append(next_v)
                    j += 1
                else:
                    break
            segments.append({
                'type': 'TRANSIT_SEQ',
                'nodes': t_nodes
            })
            i = j

    # Rehydrate backwards from target_arrival_secs
    legs = []
    curr_target = target_arrival_secs
    replacement_buses_used = False
    
    for seg in reversed(segments):
        if seg['type'] == 'WALK':
            dur_mins = seg['walk_mins']
            dist_km = seg['dist_km']
            start_t = curr_target - int(dur_mins * 60)
            
            target_name = dest_address if seg['to_node'] == 'DESTINATION' else G.nodes[seg['to_node']].get('name', seg['to_node'])
            from_name = start_address if seg['from_node'] == 'ORIGIN' else G.nodes[seg['from_node']].get('name', seg['from_node'])

            from_lat = G.nodes[seg['from_node']].get('lat')
            from_lon = G.nodes[seg['from_node']].get('lon')
            to_lat = G.nodes[seg['to_node']].get('lat')
            to_lon = G.nodes[seg['to_node']].get('lon')

            walk_coords = []
            if from_lat is not None and from_lon is not None:
                walk_coords.append([from_lon, from_lat])
            if to_lat is not None and to_lon is not None:
                walk_coords.append([to_lon, to_lat])

            legs.append({
                'type': 'WALK',
                'mode': 'Walk',
                'instruction': f"Walk {dist_km:.2f}km to {target_name}",
                'duration_mins': max(1, round(dur_mins)),
                'start_time': format_secs(start_t),
                'end_time': format_secs(curr_target),
                'from_stop': from_name,
                'to_stop': target_name,
                'from_lat': from_lat,
                'from_lon': from_lon,
                'to_lat': to_lat,
                'to_lon': to_lon,
                'coordinates': walk_coords
            })
            curr_target = start_t
            
        elif seg['type'] == 'TRANSIT_SEQ':
            t_nodes = seg['nodes']
            end_idx = len(t_nodes) - 1
            while end_idx > 0:
                found_leg = None
                best_start_idx = end_idx - 1
                
                # Check if this subsegment consists of replacement bus edges
                is_rep_bus_segment = any(
                    G[t_nodes[k]][t_nodes[k+1]].get('is_replacement', False) or 
                    G[t_nodes[k]][t_nodes[k+1]].get('mode') == 'Replacement Bus'
                    for k in range(0, end_idx)
                )
                
                if not is_rep_bus_segment:
                    # Find the earliest start_idx that is served on a single scheduled trip
                    for start_idx in range(0, end_idx):
                        s_u = t_nodes[start_idx]
                        s_v = t_nodes[end_idx]
                        t_leg = get_latest_transit_leg_backward(conn, s_u, s_v, curr_target,
                                                                cancelled_trips=cancelled_trips,
                                                                cancelled_routes=cancelled_routes,
                                                                disruptions=normalized_disruptions)
                        if t_leg:
                            found_leg = t_leg
                            best_start_idx = start_idx
                            break
                
                s_u = t_nodes[best_start_idx]
                s_v = t_nodes[end_idx]
                u_name = G.nodes[s_u].get('name', s_u)
                v_name = G.nodes[s_v].get('name', s_v)
                stops_count = end_idx - best_start_idx
                
                # Gather coordinates for all intermediate stops along this transit leg
                sub_nodes = t_nodes[best_start_idx : end_idx + 1]
                transit_coords = []
                for node_id in sub_nodes:
                    n_lat = G.nodes[node_id].get('lat')
                    n_lon = G.nodes[node_id].get('lon')
                    if n_lat is not None and n_lon is not None:
                        transit_coords.append([n_lon, n_lat])

                if found_leg:
                    dur_mins = max(1, (found_leg['arrival_secs'] - found_leg['departure_secs']) // 60)
                    legs.append({
                        'type': 'TRANSIT',
                        'mode': found_leg['mode'],
                        'route': found_leg['route_name'],
                        'instruction': f"Take {found_leg['mode']} {found_leg['route_name']} from {u_name} to {v_name} ({dur_mins} mins, {stops_count} stop{'s' if stops_count > 1 else ''})",
                        'duration_mins': dur_mins,
                        'start_time': format_secs(found_leg['departure_secs']),
                        'end_time': format_secs(found_leg['arrival_secs']),
                        'trip_id': found_leg['trip_id'],
                        'stops_count': stops_count,
                        'from_stop': u_name,
                        'to_stop': v_name,
                        'is_replacement': False,
                        'from_lat': G.nodes[s_u].get('lat'),
                        'from_lon': G.nodes[s_u].get('lon'),
                        'to_lat': G.nodes[s_v].get('lat'),
                        'to_lon': G.nodes[s_v].get('lon'),
                        'coordinates': transit_coords
                    })
                    curr_target = found_leg['departure_secs']
                else:
                    total_dur = sum(G[t_nodes[k]][t_nodes[k+1]]['weight'] for k in range(best_start_idx, end_idx))
                    dep_secs = curr_target - int(total_dur * 60)
                    mode = G[s_u][t_nodes[best_start_idx+1]].get('mode', 'Transit')
                    route = G[s_u][t_nodes[best_start_idx+1]].get('route', 'Transit')
                    is_rep = G[s_u][t_nodes[best_start_idx+1]].get('is_replacement', False) or (mode == 'Replacement Bus')
                    
                    if is_rep:
                        replacement_buses_used = True
                        trip_tag = 'REPLACEMENT_BUS'
                        instruction = f"Take Rail Replacement Bus ({route}) from {u_name} to {v_name} ({round(total_dur)} mins, {stops_count} stop{'s' if stops_count > 1 else ''})"
                    else:
                        trip_tag = 'SCHEDULED'
                        instruction = f"Take {mode} {route} from {u_name} to {v_name} ({round(total_dur)} mins, {stops_count} stop{'s' if stops_count > 1 else ''})"
                        
                    legs.append({
                        'type': 'TRANSIT',
                        'mode': mode,
                        'route': route,
                        'instruction': instruction,
                        'duration_mins': max(1, round(total_dur)),
                        'start_time': format_secs(dep_secs),
                        'end_time': format_secs(curr_target),
                        'trip_id': trip_tag,
                        'stops_count': stops_count,
                        'from_stop': u_name,
                        'to_stop': v_name,
                        'is_replacement': is_rep,
                        'from_lat': G.nodes[s_u].get('lat'),
                        'from_lon': G.nodes[s_u].get('lon'),
                        'to_lat': G.nodes[s_v].get('lat'),
                        'to_lon': G.nodes[s_v].get('lon'),
                        'coordinates': transit_coords
                    })
                    curr_target = dep_secs
                end_idx = best_start_idx

    # Chronological ordering
    legs.reverse()
    
    # Merge consecutive WALK legs if any
    merged_legs = []
    for l in legs:
        if merged_legs and merged_legs[-1]['type'] == 'WALK' and l['type'] == 'WALK':
            prev = merged_legs[-1]
            dur = prev['duration_mins'] + l['duration_mins']
            prev_coords = prev.get('coordinates', [])
            l_coords = l.get('coordinates', [])
            combined_coords = list(prev_coords)
            for pt in l_coords:
                if not combined_coords or pt != combined_coords[-1]:
                    combined_coords.append(pt)
            merged_legs[-1] = {
                'type': 'WALK',
                'mode': 'Walk',
                'instruction': f"Walk to {l['to_stop']}",
                'duration_mins': dur,
                'start_time': prev['start_time'],
                'end_time': l['end_time'],
                'from_stop': prev['from_stop'],
                'to_stop': l['to_stop'],
                'from_lat': prev.get('from_lat'),
                'from_lon': prev.get('from_lon'),
                'to_lat': l.get('to_lat'),
                'to_lon': l.get('to_lon'),
                'coordinates': combined_coords
            }
        else:
            merged_legs.append(l)

    # Calculate summary metrics
    transit_legs = [l for l in merged_legs if l['type'] == 'TRANSIT']
    transfers_count = max(0, len(transit_legs) - 1)
    modes_sequence = [l['mode'] for l in merged_legs]
    
    # Route path stops representation
    route_nodes = []
    if merged_legs:
        route_nodes.append(merged_legs[0]['from_stop'])
        for l in merged_legs:
            route_nodes.append(l['to_stop'])
            
    total_duration = (target_arrival_secs - curr_target) / 60
    
    itinerary = {
        "status": "Success",
        "total_travel_time_mins": round(total_duration),
        "latest_departure_time": format_secs(curr_target),
        "computation_time_secs": round(time.perf_counter() - start_perf, 3),
        "legs": merged_legs,
        "route": route_nodes,
        "modes_used": modes_sequence,
        "modes_summary": " -> ".join(modes_sequence),
        "transfers_count": transfers_count,
        "disruptions_applied": normalized_disruptions,
        "replacement_buses_used": replacement_buses_used,
        "origin_coords": (origin_lat, origin_lon),
        "dest_coords": (dest_lat, dest_lon)
    }
    
    conn.close()
    return itinerary

if __name__ == "__main__":
    test_arrival = datetime(2026, 8, 20, 9, 0, 0)
    print("\n--- TEST: Normal Route ---")
    itin1 = calculate_directional_itinerary("Richmond", "Footscray", test_arrival)
    print(f"Modes: {itin1['modes_summary']} | Time: {itin1['total_travel_time_mins']}m")

    print("\n--- TEST: Sandringham Line Cancelled with Replacement Bus ---")
    itin2 = calculate_directional_itinerary("Richmond", "Footscray", test_arrival,
                                           disruptions=[{"route_name": "Sandringham", "effect": "NO_SERVICE", "replacement_bus_available": True}])
    print(f"Modes: {itin2['modes_summary']} | Time: {itin2['total_travel_time_mins']}m | Rep Bus: {itin2['replacement_buses_used']}")
