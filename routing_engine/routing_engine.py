import sqlite3
import math
from datetime import datetime, timedelta
import os
import sys
import osmnx as ox
import networkx as nx
import itertools

ox.settings.use_cache = True

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

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

def walking_time_mins(distance_km):
    return (distance_km / WALKING_SPEED_KMH) * 60.0

def get_nearby_stops(conn, lat, lon):
    """Returns stops with recursive fallback 500m -> 1km -> 1.5km -> 2km"""
    c = conn.cursor()
    c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops")
    all_stops = []
    
    for row in c.fetchall():
        stop_id, stop_name, stop_lat, stop_lon = row
        dist = haversine(lat, lon, stop_lat, stop_lon)
        all_stops.append({
            'stop_id': stop_id,
            'stop_name': stop_name,
            'stop_lat': stop_lat,
            'stop_lon': stop_lon,
            'distance_km': dist,
            'walk_time_mins': walking_time_mins(dist)
        })
        
    all_stops.sort(key=lambda x: x['distance_km'])
    
    for radius in [0.5, 1.0, 1.5, 2.0]:
        nearby = [s for s in all_stops if s['distance_km'] <= radius]
        if nearby:
            return nearby
            
    # Absolute fallback
    if all_stops:
        return [all_stops[0]]
    return []

def get_osmnx_walking_stats(lat1, lon1, lat2, lon2):
    try:
        mid_lat = (lat1 + lat2) / 2
        mid_lon = (lon1 + lon2) / 2
        dist_m = haversine(lat1, lon1, lat2, lon2) * 1000
        radius_m = max(dist_m * 1.5, 500)
        
        G = ox.graph_from_point((mid_lat, mid_lon), dist=radius_m, network_type='walk', simplify=False)
        orig_node = ox.distance.nearest_nodes(G, X=lon1, Y=lat1)
        dest_node = ox.distance.nearest_nodes(G, X=lon2, Y=lat2)
        
        route_length_m = nx.shortest_path_length(G, orig_node, dest_node, weight='length')
        route_length_km = route_length_m / 1000.0
        
        return route_length_km, walking_time_mins(route_length_km)
    except Exception as e:
        print(f"OSMnx routing failed: {e}. Falling back to haversine.")
        dist = haversine(lat1, lon1, lat2, lon2)
        return dist, walking_time_mins(dist)

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

def build_spatial_graph(conn, origin_lat, origin_lon, dest_lat, dest_lon, start_secs, end_secs):
    """Builds a spatial NetworkX graph of stops and average transit times within a bounding box and time window."""
    G = nx.DiGraph()
    c = conn.cursor()
    
    # 1. Bounding box to limit graph size
    min_lat, max_lat = min(origin_lat, dest_lat) - 0.05, max(origin_lat, dest_lat) + 0.05
    min_lon, max_lon = min(origin_lon, dest_lon) - 0.05, max(origin_lon, dest_lon) + 0.05
    
    # Load stops in bbox
    c.execute("SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE stop_lat BETWEEN ? AND ? AND stop_lon BETWEEN ? AND ?", 
              (min_lat, max_lat, min_lon, max_lon))
    
    stops_in_bbox = {}
    for row in c.fetchall():
        G.add_node(row[0], name=row[1], lat=row[2], lon=row[3], type='transit_stop')
        stops_in_bbox[row[0]] = {'lat': row[2], 'lon': row[3], 'name': row[1]}
        
    if not stops_in_bbox:
        return G
        
    stop_ids = tuple(stops_in_bbox.keys())
    
    # Load transit edges (average time between consecutive stops)
    # Note: SQLite has a limit on IN clause size (999 usually), so we might just use the time window and filter in python
    query = """
    SELECT 
        st1.stop_id, 
        st2.stop_id, 
        r.route_type, 
        r.route_short_name,
        AVG(st2.arrival_time_secs - st1.departure_time_secs) as avg_travel_time
    FROM stop_times st1
    JOIN stop_times st2 ON st1.trip_id = st2.trip_id AND st1.stop_sequence + 1 = st2.stop_sequence
    JOIN trips t ON st1.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    WHERE st1.departure_time_secs BETWEEN ? AND ?
    GROUP BY st1.stop_id, st2.stop_id, r.route_type, r.route_short_name
    """
    c.execute(query, (start_secs, end_secs))
    
    for row in c.fetchall():
        u, v, route_type, route_name, avg_time = row
        if u in stops_in_bbox and v in stops_in_bbox:
            if avg_time < 0: avg_time = 0
            # weight is minutes
            weight = avg_time / 60.0
            
            if G.has_edge(u, v):
                # Keep the fastest route
                if weight < G[u][v]['weight']:
                    G[u][v]['weight'] = weight
                    G[u][v]['mode'] = get_mode_name(route_type)
                    G[u][v]['route'] = route_name
            else:
                G.add_edge(u, v, weight=weight, type='transit', mode=get_mode_name(route_type), route=route_name)

    # Add transfer edges between nearby stops using Haversine to pre-filter, then OSMnx
    # To avoid n^2 OSMnx calls, we only do it for stops < 500m apart
    print("Building transfer edges...")
    nodes = list(G.nodes())
    for i, u in enumerate(nodes):
        for j in range(i + 1, len(nodes)):
            v = nodes[j]
            lat1, lon1 = G.nodes[u]['lat'], G.nodes[u]['lon']
            lat2, lon2 = G.nodes[v]['lat'], G.nodes[v]['lon']
            dist = haversine(lat1, lon1, lat2, lon2)
            if dist <= 0.5:
                # Add a proxy edge first to speed things up, we could refine with OSMnx if needed but for full graph it's too slow
                # For this implementation, we will use Haversine for the bulk transfer edges to keep graph building fast,
                # But we will use exact OSMnx for the origin -> start_stop and end_stop -> destination.
                walk_time = walking_time_mins(dist)
                G.add_edge(u, v, weight=walk_time, type='walk', distance_km=dist)
                G.add_edge(v, u, weight=walk_time, type='walk', distance_km=dist)

    return G

def get_exact_transit_leg(conn, start_stop_id, end_stop_id, departure_time_secs, window_secs=7200):
    c = conn.cursor()
    query = """
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
      AND st1.departure_time_secs >= ?
      AND st1.departure_time_secs <= ?
    ORDER BY st2.arrival_time_secs ASC
    LIMIT 1
    """
    c.execute(query, (start_stop_id, end_stop_id, departure_time_secs, departure_time_secs + window_secs))
    row = c.fetchone()
    if row:
        return {
            'trip_id': row[0],
            'route_name': row[1],
            'mode': get_mode_name(row[2]),
            'departure_secs': row[3],
            'arrival_secs': row[4]
        }
    return None

def calculate_itinerary(origin_lat, origin_lon, dest_lat, dest_lon, departure_dt, db_path=DB_NAME):
    """Calculates an end-to-end multi-modal itinerary using Bi-directional Dijkstra."""
    conn = sqlite3.connect(db_path)
    
    base_departure_secs = int(departure_dt.hour * 3600 + departure_dt.minute * 60 + departure_dt.second)
    end_window_secs = base_departure_secs + 7200 # 2 hour window
    
    print("Building spatial graph...")
    G = build_spatial_graph(conn, origin_lat, origin_lon, dest_lat, dest_lon, base_departure_secs, end_window_secs)
    
    # Connect Origin
    G.add_node('ORIGIN', type='location', lat=origin_lat, lon=origin_lon)
    start_stops = get_nearby_stops(conn, origin_lat, origin_lon)
    for s in start_stops:
        if s['stop_id'] in G:
            print(f"Calculating exact OSMnx walk to {s['stop_name']}")
            dist_km, walk_time = get_osmnx_walking_stats(origin_lat, origin_lon, s['stop_lat'], s['stop_lon'])
            G.add_edge('ORIGIN', s['stop_id'], weight=walk_time, type='walk', distance_km=dist_km)
            
    # Connect Destination
    G.add_node('DESTINATION', type='location', lat=dest_lat, lon=dest_lon)
    end_stops = get_nearby_stops(conn, dest_lat, dest_lon)
    for s in end_stops:
        if s['stop_id'] in G:
            print(f"Calculating exact OSMnx walk from {s['stop_name']}")
            dist_km, walk_time = get_osmnx_walking_stats(s['stop_lat'], s['stop_lon'], dest_lat, dest_lon)
            G.add_edge(s['stop_id'], 'DESTINATION', weight=walk_time, type='walk', distance_km=dist_km)
            
    if G.out_degree('ORIGIN') == 0 or G.in_degree('DESTINATION') == 0:
        conn.close()
        return {"status": "Error", "message": "No transit stops found near origin or destination within graph bounds."}
        
    print("Running Bi-directional Dijkstra...")
    try:
        path_length, path_nodes = nx.bidirectional_dijkstra(G, 'ORIGIN', 'DESTINATION', weight='weight')
    except nx.NetworkXNoPath:
        conn.close()
        return {"status": "Error", "message": "No direct transit routes found matching your time window."}

    # Rehydrate timeline with exact schedule data
    print("Rehydrating exact timetable...")
    
    itinerary = {
        "status": "Success",
        "total_travel_time_mins": 0,
        "legs": []
    }
    
    def format_secs(s):
        h = (s // 3600) % 24
        m = (s % 3600) // 60
        return f"{h:02d}:{m:02d}"
        
    current_time_secs = base_departure_secs
    current_dt = departure_dt
    
    for i in range(len(path_nodes) - 1):
        u = path_nodes[i]
        v = path_nodes[i+1]
        edge_data = G[u][v]
        
        if edge_data['type'] == 'walk':
            dur_mins = edge_data['weight']
            dist_km = edge_data.get('distance_km', dur_mins / 60.0 * WALKING_SPEED_KMH)
            
            end_time_secs = current_time_secs + int(dur_mins * 60)
            
            target_name = "Destination" if v == 'DESTINATION' else G.nodes[v].get('name', v)
            
            itinerary["legs"].append({
                "type": "WALK",
                "instruction": f"Walk {dist_km:.2f}km to {target_name}",
                "duration_mins": round(dur_mins),
                "start_time": format_secs(current_time_secs),
                "end_time": format_secs(end_time_secs)
            })
            current_time_secs = end_time_secs
            
        elif edge_data['type'] == 'transit':
            transit_leg = get_exact_transit_leg(conn, u, v, current_time_secs, 7200)
            if not transit_leg:
                # Fallback if miss connection
                conn.close()
                return {"status": "Error", "message": "Could not find valid timetable connection for the routed path."}
                
            wait_time_secs = transit_leg['departure_secs'] - current_time_secs
            
            transit_dur = (transit_leg['arrival_secs'] - transit_leg['departure_secs']) // 60
            
            itinerary["legs"].append({
                "type": "TRANSIT",
                "mode": transit_leg['mode'],
                "route": transit_leg['route_name'],
                "instruction": f"Take {transit_leg['mode']} {transit_leg['route_name']} from {G.nodes[u]['name']} to {G.nodes[v]['name']}",
                "duration_mins": transit_dur,
                "start_time": format_secs(transit_leg['departure_secs']),
                "end_time": format_secs(transit_leg['arrival_secs']),
                "trip_id": transit_leg['trip_id']
            })
            current_time_secs = transit_leg['arrival_secs']
            
    itinerary["total_travel_time_mins"] = round((current_time_secs - base_departure_secs) / 60)
    conn.close()
    return itinerary

if __name__ == "__main__":
    now = datetime(2026, 8, 20, 7, 45, 0)
    itin = calculate_itinerary(-37.8090, 144.9590, -37.8210, 144.9710, now)
    import json
    print(json.dumps(itin, indent=2))
