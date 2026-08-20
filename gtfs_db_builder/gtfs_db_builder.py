import sqlite3
import csv
import zipfile
import os
import sys
import urllib.request
import io
import shutil

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

def init_db(conn):
    c = conn.cursor()
    # Create tables
    c.executescript('''
        DROP TABLE IF EXISTS stops;
        CREATE TABLE stops (
            stop_id TEXT PRIMARY KEY,
            stop_name TEXT,
            stop_lat REAL,
            stop_lon REAL,
            location_type INTEGER,
            parent_station TEXT
        );

        DROP TABLE IF EXISTS routes;
        CREATE TABLE routes (
            route_id TEXT PRIMARY KEY,
            route_short_name TEXT,
            route_long_name TEXT,
            route_type INTEGER
        );

        DROP TABLE IF EXISTS trips;
        CREATE TABLE trips (
            route_id TEXT,
            service_id TEXT,
            trip_id TEXT PRIMARY KEY,
            direction_id INTEGER
        );

        DROP TABLE IF EXISTS stop_times;
        CREATE TABLE stop_times (
            trip_id TEXT,
            arrival_time TEXT,
            departure_time TEXT,
            stop_id TEXT,
            stop_sequence INTEGER,
            arrival_time_secs INTEGER,
            departure_time_secs INTEGER
        );

        DROP TABLE IF EXISTS calendar;
        CREATE TABLE calendar (
            service_id TEXT PRIMARY KEY,
            monday INTEGER,
            tuesday INTEGER,
            wednesday INTEGER,
            thursday INTEGER,
            friday INTEGER,
            saturday INTEGER,
            sunday INTEGER,
            start_date TEXT,
            end_date TEXT
        );

        DROP TABLE IF EXISTS calendar_dates;
        CREATE TABLE calendar_dates (
            service_id TEXT,
            date TEXT,
            exception_type INTEGER
        );
    ''')
    conn.commit()

def time_to_secs(time_str):
    """Convert HH:MM:SS to seconds past midnight."""
    try:
        h, m, s = map(int, time_str.strip().split(':'))
        return h * 3600 + m * 60 + s
    except Exception:
        return -1

def import_csv_to_table(conn, table_name, csv_file_obj, expected_columns, transform_func=None):
    c = conn.cursor()
    reader = csv.DictReader(io.TextIOWrapper(csv_file_obj, encoding='utf-8-sig'))
    
    insert_sql = f"INSERT OR IGNORE INTO {table_name} ({', '.join(expected_columns)}) VALUES ({', '.join(['?'] * len(expected_columns))})"
    
    batch = []
    for row in reader:
        if transform_func:
            row = transform_func(row)
        
        values = [row.get(col, '') for col in expected_columns]
        batch.append(values)
        
        if len(batch) >= 10000:
            c.executemany(insert_sql, batch)
            batch = []
    
    if batch:
        c.executemany(insert_sql, batch)
    
    conn.commit()

def build_db_from_zips(zip_paths, db_path=DB_NAME):
    print(f"Building GTFS database from {len(zip_paths)} zip file(s)...")
    # Remove existing DB if it exists so we start fresh
    if os.path.exists(db_path):
        os.remove(db_path)
        
    conn = sqlite3.connect(db_path)
    init_db(conn)
    
    for zip_path in zip_paths:
        print(f"\nProcessing {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as z:
            files = z.namelist()
            
            if 'stops.txt' in files:
                print("Importing stops...")
                with z.open('stops.txt') as f:
                    import_csv_to_table(conn, 'stops', f, ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'])
        
            if 'routes.txt' in files:
                print("Importing routes...")
                with z.open('routes.txt') as f:
                    import_csv_to_table(conn, 'routes', f, ['route_id', 'route_short_name', 'route_long_name', 'route_type'])
                    
            if 'trips.txt' in files:
                print("Importing trips...")
                with z.open('trips.txt') as f:
                    import_csv_to_table(conn, 'trips', f, ['route_id', 'service_id', 'trip_id', 'direction_id'])
                    
            if 'stop_times.txt' in files:
                print("Importing stop_times (this may take a while)...")
                def transform_st(row):
                    row['arrival_time_secs'] = time_to_secs(row.get('arrival_time', ''))
                    row['departure_time_secs'] = time_to_secs(row.get('departure_time', ''))
                    return row
                with z.open('stop_times.txt') as f:
                    import_csv_to_table(conn, 'stop_times', f, 
                                        ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'arrival_time_secs', 'departure_time_secs'],
                                        transform_func=transform_st)
                    
            if 'calendar.txt' in files:
                print("Importing calendar...")
                with z.open('calendar.txt') as f:
                    import_csv_to_table(conn, 'calendar', f, 
                                        ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'])
                    
            if 'calendar_dates.txt' in files:
                print("Importing calendar_dates...")
                with z.open('calendar_dates.txt') as f:
                    import_csv_to_table(conn, 'calendar_dates', f, ['service_id', 'date', 'exception_type'])

    # Create indexes for fast routing
    print("Creating indexes...")
    c = conn.cursor()
    c.executescript('''
        CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);
        CREATE INDEX idx_stop_times_trip ON stop_times(trip_id);
        CREATE INDEX idx_stop_times_arr_secs ON stop_times(arrival_time_secs);
        CREATE INDEX idx_trips_route ON trips(route_id);
        CREATE INDEX idx_trips_service ON trips(service_id);
        CREATE INDEX idx_stops_lat_lon ON stops(stop_lat, stop_lon);
    ''')
    conn.commit()
    conn.close()
    print("Database build complete.")

def build_mock_gtfs():
    """Generates a small mock GTFS dataset for testing."""
    import tempfile
    
    d = tempfile.mkdtemp()
    
    with open(os.path.join(d, 'stops.txt'), 'w') as f:
        f.write("stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\n")
        f.write("S1,Start Street,-37.8100,144.9600,0,\n")
        f.write("S2,Middle Ave,-37.8150,144.9650,0,\n")
        f.write("S3,End Station,-37.8200,144.9700,0,\n")
        f.write("S4,Bus Stop,-37.8110,144.9610,0,\n")
        
    with open(os.path.join(d, 'routes.txt'), 'w') as f:
        f.write("route_id,route_short_name,route_long_name,route_type\n")
        f.write("R1,100,Main Line,2\n") # Train
        f.write("R2,200,Bus Line,3\n") # Bus
        
    with open(os.path.join(d, 'trips.txt'), 'w') as f:
        f.write("route_id,service_id,trip_id,direction_id\n")
        f.write("R1,SRV1,T1,0\n")
        f.write("R2,SRV1,T2,0\n")
        
    with open(os.path.join(d, 'stop_times.txt'), 'w') as f:
        f.write("trip_id,arrival_time,departure_time,stop_id,stop_sequence\n")
        # Train trip
        f.write("T1,08:00:00,08:00:00,S1,1\n")
        f.write("T1,08:10:00,08:10:00,S2,2\n")
        f.write("T1,08:20:00,08:20:00,S3,3\n")
        # Bus trip
        f.write("T2,07:50:00,07:50:00,S4,1\n")
        f.write("T2,07:58:00,07:58:00,S1,2\n") # Bus drops off near train start
        
    with open(os.path.join(d, 'calendar.txt'), 'w') as f:
        f.write("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n")
        f.write("SRV1,1,1,1,1,1,1,1,20200101,20301231\n")
        
    zip_path = 'mock_gtfs.zip'
    with zipfile.ZipFile(zip_path, 'w') as z:
        for fname in ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt']:
            z.write(os.path.join(d, fname), fname)
            
    shutil.rmtree(d)
    return zip_path

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        gtfs_zips = sys.argv[1:]
    else:
        print("No GTFS zip provided, building mock GTFS data for testing...")
        gtfs_zips = [build_mock_gtfs()]
        
    build_db_from_zips(gtfs_zips)
