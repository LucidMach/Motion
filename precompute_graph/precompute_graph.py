import sqlite3
import math
import time
import os
import sys
import numpy as np
from scipy.spatial import KDTree

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

def lat_lon_to_cartesian(lat, lon):
    """Converts lat/lon in degrees to Cartesian (x, y, z) on unit sphere."""
    lat_r = np.radians(lat)
    lon_r = np.radians(lon)
    x = np.cos(lat_r) * np.cos(lon_r)
    y = np.cos(lat_r) * np.sin(lon_r)
    z = np.sin(lat_r)
    return np.column_stack((x, y, z))

def precompute_transit_edges(conn):
    print("\n1. Precomputing Transit Network Edges...")
    t0 = time.perf_counter()
    c = conn.cursor()
    
    c.execute("DROP TABLE IF EXISTS transit_network_edges")
    c.execute("""
        CREATE TABLE transit_network_edges (
            from_stop_id TEXT,
            to_stop_id TEXT,
            route_type INTEGER,
            route_short_name TEXT,
            avg_travel_time REAL
        )
    """)
    
    # Query all consecutive stop times and average duration
    insert_sql = """
    INSERT INTO transit_network_edges
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
    GROUP BY st1.stop_id, st2.stop_id, r.route_type, r.route_short_name
    """
    c.execute(insert_sql)
    
    print("Creating indexes on transit_network_edges...")
    c.execute("CREATE INDEX idx_tne_from ON transit_network_edges(from_stop_id)")
    c.execute("CREATE INDEX idx_tne_to ON transit_network_edges(to_stop_id)")
    conn.commit()
    
    count = c.execute("SELECT COUNT(*) FROM transit_network_edges").fetchone()[0]
    print(f"✓ Created {count} transit edges in {time.perf_counter() - t0:.2f}s")

def precompute_transfer_edges(conn, max_walk_distance_km=0.5):
    print("\n2. Precomputing Walking Transfer Edges (KDTree Spatial Search)...")
    t0 = time.perf_counter()
    c = conn.cursor()
    
    c.execute("DROP TABLE IF EXISTS transfer_edges")
    c.execute("""
        CREATE TABLE transfer_edges (
            from_stop_id TEXT,
            to_stop_id TEXT,
            distance_km REAL,
            walk_time_mins REAL
        )
    """)
    
    # Load all stops
    c.execute("SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_lat IS NOT NULL AND stop_lon IS NOT NULL")
    stops = c.fetchall()
    stop_ids = [s[0] for s in stops]
    lats = np.array([s[1] for s in stops])
    lons = np.array([s[2] for s in stops])
    
    # Unit sphere coordinates for KDTree
    xyz = lat_lon_to_cartesian(lats, lons)
    tree = KDTree(xyz)
    
    # 500m on Earth in unit sphere chord distance: 2 * sin(d / (2 * R))
    R = 6371.0
    r_chord = 2.0 * np.sin(max_walk_distance_km / (2.0 * R))
    
    pairs = tree.query_pairs(r=r_chord)
    print(f"Found {len(pairs)} transfer stop pairs within {max_walk_distance_km*1000:.0f}m.")
    
    batch = []
    for i, j in pairs:
        u_id = stop_ids[i]
        v_id = stop_ids[j]
        dist = haversine(lats[i], lons[i], lats[j], lons[j])
        if dist <= max_walk_distance_km:
            w_time = walking_time_mins(dist)
            batch.append((u_id, v_id, dist, w_time))
            batch.append((v_id, u_id, dist, w_time))
            
    c.executemany("INSERT INTO transfer_edges VALUES (?, ?, ?, ?)", batch)
    
    print("Creating indexes on transfer_edges...")
    c.execute("CREATE INDEX idx_te_from ON transfer_edges(from_stop_id)")
    c.execute("CREATE INDEX idx_te_to ON transfer_edges(to_stop_id)")
    conn.commit()
    
    count = c.execute("SELECT COUNT(*) FROM transfer_edges").fetchone()[0]
    print(f"✓ Created {count} transfer walking edges in {time.perf_counter() - t0:.2f}s")

def run_precomputation(db_path=DB_NAME):
    print("=" * 60)
    print("PRECOMPUTING TRANSIT & TRANSFER SPATIAL GRAPH EDGES")
    print(f"Database: {db_path}")
    print("=" * 60)
    
    conn = sqlite3.connect(db_path)
    precompute_transit_edges(conn)
    precompute_transfer_edges(conn)
    conn.close()
    print("\n✓ Precomputation complete! Spatial graph querying is now instantaneous.")

if __name__ == '__main__':
    run_precomputation()
