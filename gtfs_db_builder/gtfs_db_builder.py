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

def import_csv_to_table(conn, table_name, csv_file_obj, expected_columns, transform_func=None, row_filter=None):
    c = conn.cursor()
    reader = csv.DictReader(io.TextIOWrapper(csv_file_obj, encoding='utf-8-sig'))

    insert_sql = f"INSERT OR IGNORE INTO {table_name} ({', '.join(expected_columns)}) VALUES ({', '.join(['?'] * len(expected_columns))})"

    batch = []
    for row in reader:
        if row_filter and not row_filter(row):
            continue

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


def collect_allowed_ids_for_route_types(zip_path, allowed_route_types):
    """
    Two-pass scan of a GTFS zip to find the route/trip/stop ids that belong
    to the given route_type values. Used for feeds that bundle multiple modes
    into one zip (e.g. PTV's bus feed mixes Melbourne metro bus routes,
    route_type '3', with regional town-bus routes, route_type '701') so the
    unwanted mode's routes/trips/stops/stop_times can all be excluded
    together rather than just dropping rows from routes.txt.
    """
    allowed_route_ids = set()
    allowed_trip_ids = set()
    allowed_stop_ids = set()

    with zipfile.ZipFile(zip_path, 'r') as z:
        files = z.namelist()

        if 'routes.txt' in files:
            with z.open('routes.txt') as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')):
                    if row.get('route_type', '').strip() in allowed_route_types:
                        allowed_route_ids.add(row.get('route_id'))

        if 'trips.txt' in files:
            with z.open('trips.txt') as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')):
                    if row.get('route_id') in allowed_route_ids:
                        allowed_trip_ids.add(row.get('trip_id'))

        if 'stop_times.txt' in files:
            with z.open('stop_times.txt') as f:
                for row in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig')):
                    if row.get('trip_id') in allowed_trip_ids:
                        allowed_stop_ids.add(row.get('stop_id'))

    return allowed_route_ids, allowed_trip_ids, allowed_stop_ids


def build_db_from_zips(zip_paths, db_path=DB_NAME, route_type_filters=None):
    """
    route_type_filters: optional {zip_path: {allowed route_type strings}}.
    Zips not present in this mapping are imported unfiltered (all routes/
    trips/stops/stop_times kept).
    """
    route_type_filters = route_type_filters or {}
    print(f"Building GTFS database from {len(zip_paths)} zip file(s)...")
    # Remove existing DB if it exists so we start fresh
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    init_db(conn)

    for zip_path in zip_paths:
        print(f"\nProcessing {zip_path}...")

        allowed_route_ids = allowed_trip_ids = allowed_stop_ids = None
        allowed_types = route_type_filters.get(zip_path)
        if allowed_types:
            print(f"  Filtering to route_type in {sorted(allowed_types)}...")
            allowed_route_ids, allowed_trip_ids, allowed_stop_ids = collect_allowed_ids_for_route_types(zip_path, allowed_types)
            print(f"    -> keeping {len(allowed_route_ids)} routes, {len(allowed_trip_ids)} trips, {len(allowed_stop_ids)} stops")

        stop_row_filter = (lambda row: row.get('stop_id') in allowed_stop_ids) if allowed_stop_ids is not None else None
        route_row_filter = (lambda row: row.get('route_id') in allowed_route_ids) if allowed_route_ids is not None else None
        trip_row_filter = (lambda row: row.get('trip_id') in allowed_trip_ids) if allowed_trip_ids is not None else None

        with zipfile.ZipFile(zip_path, 'r') as z:
            files = z.namelist()

            if 'stops.txt' in files:
                print("Importing stops...")
                with z.open('stops.txt') as f:
                    import_csv_to_table(conn, 'stops', f, ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'],
                                        row_filter=stop_row_filter)

            if 'routes.txt' in files:
                print("Importing routes...")
                with z.open('routes.txt') as f:
                    import_csv_to_table(conn, 'routes', f, ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
                                        row_filter=route_row_filter)

            if 'trips.txt' in files:
                print("Importing trips...")
                with z.open('trips.txt') as f:
                    import_csv_to_table(conn, 'trips', f, ['route_id', 'service_id', 'trip_id', 'direction_id'],
                                        row_filter=trip_row_filter)

            if 'stop_times.txt' in files:
                print("Importing stop_times (this may take a while)...")
                def transform_st(row):
                    row['arrival_time_secs'] = time_to_secs(row.get('arrival_time', ''))
                    row['departure_time_secs'] = time_to_secs(row.get('departure_time', ''))
                    return row
                with z.open('stop_times.txt') as f:
                    import_csv_to_table(conn, 'stop_times', f,
                                        ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'arrival_time_secs', 'departure_time_secs'],
                                        transform_func=transform_st, row_filter=trip_row_filter)
                    
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
    import argparse

    parser = argparse.ArgumentParser(description="Build the Motion GTFS SQLite database from one or more feed zips.")
    parser.add_argument('zips', nargs='*', help="GTFS feed zip paths to ingest")
    parser.add_argument(
        '--filter', action='append', default=[], metavar='ZIP_PATH:TYPE1,TYPE2',
        help=(
            "Restrict a zip to only these GTFS route_type values, dropping "
            "everything else (routes/trips/stops/stop_times) not reachable "
            "from them. Useful for feeds that bundle multiple modes into one "
            "zip, e.g. --filter gtfs/4/google_transit.zip:3 keeps only "
            "metro bus (route_type 3) and drops the regional town-bus "
            "routes (route_type 701) bundled in the same feed. Repeatable."
        )
    )
    args = parser.parse_args()

    if args.zips:
        gtfs_zips = args.zips
    else:
        print("No GTFS zip provided, building mock GTFS data for testing...")
        gtfs_zips = [build_mock_gtfs()]

    route_type_filters = {}
    for spec in args.filter:
        zip_path, _, types_str = spec.partition(':')
        route_type_filters[zip_path] = {t.strip() for t in types_str.split(',') if t.strip()}

    build_db_from_zips(gtfs_zips, route_type_filters=route_type_filters)
