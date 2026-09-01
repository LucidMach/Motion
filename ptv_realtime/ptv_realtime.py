import requests
from google.transit import gtfs_realtime_pb2
import time
import sys
import sqlite3
from datetime import datetime, timedelta
import os
import argparse
from geopy.geocoders import Nominatim

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import directional_routing

def load_env():
    env_paths = [
        os.path.join(PROJECT_ROOT, ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.getcwd(), ".env")
    ]
    for env_path in env_paths:
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')
            break

load_env()

API_KEY = os.getenv("PTV_API_KEY") or os.getenv("PTVOpenDataAPIKey", "")
DIRECT_TRIP_UPDATES_URL = "https://opendata.transport.vic.gov.au/dataset/2d9a7228-5b81-40d3-8075-ae7a3da42198/resource/0010d606-47bf-4abb-a04f-63add63a4d23/download/gtfsr_metro_train_trip_updates.pb"

SERVICE_ALERT_URLS = {
    "metro_train": "https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/66dfd529-65a4-44b2-a4f6-8fa82b535d88/download/gtfsr_metro_train_service_alerts.pb",
    "metro_tram": "https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/c444007d-5a82-4217-a068-07b9a5dd5b2d/download/gtfsr_metro_tram_service_alerts.pb",
    "metro_bus": "https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/82a7a4c7-1a06-444f-a42e-836f6d2f33f9/download/gtfsr_metro_bus_service_alerts.pb",
    "regional_train": "https://opendata.transport.vic.gov.au/dataset/c2fe79ec-14a0-496e-a34f-01a24d081f9b/resource/f67e4526-728b-4c5a-b620-6d04e389e9f9/download/gtfsr_regional_train_service_alerts.pb"
}

def parse_arrival_datetime(destination_arrival_time):
    """
    Parses arrival time from multiple formats:
    - 'HH:MM' (24-hour clock, assumes today or tomorrow if earlier than now)
    - 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DDTHH:MM:SS'
    - Unix epoch integer/float or timestamp string
    - datetime object
    """
    if isinstance(destination_arrival_time, datetime):
        return destination_arrival_time
        
    if isinstance(destination_arrival_time, (int, float)):
        return datetime.fromtimestamp(destination_arrival_time)
        
    if isinstance(destination_arrival_time, str):
        val = destination_arrival_time.strip()
        # Check if numeric unix timestamp string
        if val.isdigit():
            return datetime.fromtimestamp(int(val))
            
        # Try ISO format 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DDTHH:MM:SS'
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                pass
                
        # Try 'HH:MM'
        try:
            parts = val.split(":")
            hour, minute = int(parts[0]), int(parts[1])
            now = datetime.now()
            target_dt = datetime(now.year, now.month, now.day, hour, minute, 0)
            if target_dt < now:
                target_dt += timedelta(days=1)
            return target_dt
        except Exception:
            raise ValueError(f"Invalid time format '{destination_arrival_time}'. Expected 'HH:MM', 'YYYY-MM-DD HH:MM', or Unix timestamp.")
            
    raise ValueError("destination_arrival_time must be a string 'HH:MM', 'YYYY-MM-DD HH:MM', Unix timestamp, or datetime object.")

def is_alert_active_at_time(active_periods, target_arrival_dt, lookback_window_mins=120):
    """
    Evaluates whether an alert's active periods overlap with the journey's time window.
    Journey window: [target_arrival - lookback_window_mins, target_arrival].
    """
    if not active_periods:
        return True # Default to active if unconstrained
        
    target_ts = int(target_arrival_dt.timestamp())
    window_start_ts = target_ts - (lookback_window_mins * 60)
    
    for period in active_periods:
        start_ts = period.get("start", 0) if isinstance(period, dict) else getattr(period, "start", 0)
        end_ts = period.get("end", 0) if isinstance(period, dict) else getattr(period, "end", 0)
        
        # If disruption has not started yet
        if start_ts and start_ts > target_ts:
            continue
        # If disruption already ended before travel window
        if end_ts and end_ts < window_start_ts:
            continue
        # Overlaps travel window
        return True
        
    return False

def resolve_route_name_from_id(route_id, db_path=directional_routing.DB_NAME):
    """Resolves a GTFS route_id into a readable line/route name using the local schedule database."""
    if not route_id or not os.path.exists(db_path):
        return route_id
    try:
        conn = sqlite3.connect(db_path)
        c = conn.cursor()
        c.execute("SELECT route_short_name, route_long_name FROM routes WHERE route_id = ? LIMIT 1", (route_id,))
        row = c.fetchone()
        conn.close()
        if row:
            return row[0] or row[1] or route_id
    except Exception:
        pass
    return route_id

def fetch_live_service_alerts(target_arrival_dt, lookback_window_mins=120, db_path=directional_routing.DB_NAME):
    """
    Fetches real-time GTFS-Realtime Service Alerts across transit modes from PTV API.
    Filters alerts to ONLY those active at the specific arrival timestamp and journey window.
    """
    print(f"Fetching real-time service alerts from Transport Victoria API (Window target: {target_arrival_dt.strftime('%Y-%m-%d %H:%M')})...")
    headers = {"KeyID": API_KEY} if API_KEY else {}
    active_disruptions = []
    
    KNOWN_LINE_NAMES = [
        "Alamein", "Belgrave", "Craigieburn", "Cranbourne", "Frankston", "Glen Waverley",
        "Hurstbridge", "Lilydale", "Mernda", "Pakenham", "Sandringham", "Stony Point",
        "Sunbury", "Upfield", "Werribee", "Williamstown"
    ]
    
    for mode_name, url in SERVICE_ALERT_URLS.items():
        try:
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code != 200 or response.content.startswith((b"<!DOCTYPE html", b"<html", b"<!doctype")):
                continue
                
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)
            
            for entity in feed.entity:
                if not entity.HasField('alert'):
                    continue
                alert = entity.alert
                
                # Check timing filter
                periods = [{"start": p.start, "end": p.end} for p in alert.active_period]
                if not is_alert_active_at_time(periods, target_arrival_dt, lookback_window_mins):
                    continue
                    
                header = alert.header_text.translation[0].text if alert.header_text.translation else ""
                desc = alert.description_text.translation[0].text if alert.description_text.translation else ""
                combined_text = f"{header} {desc}".strip()
                
                effect_code = alert.effect
                # Map GTFS-RT Effect enum: 1=NO_SERVICE, 2=REDUCED_SERVICE, 3=SIGNIFICANT_DELAYS, 4=DETOUR
                if effect_code in (1, 2):
                    effect_str = "NO_SERVICE"
                elif effect_code == 3:
                    effect_str = "DELAYED"
                else:
                    effect_str = "NO_SERVICE"
                    
                has_replacement_bus = any(kw in combined_text.lower() for kw in [
                    "replacement bus", "buses replace", "bus replacement", "replacement buses", "buses replacing"
                ])
                
                matched_routes = set()
                for ie in alert.informed_entity:
                    if ie.route_id:
                        r_name = resolve_route_name_from_id(ie.route_id, db_path=db_path)
                        if r_name:
                            matched_routes.add(r_name)
                            
                for line in KNOWN_LINE_NAMES:
                    if line.lower() in combined_text.lower():
                        matched_routes.add(line)
                        
                if not matched_routes:
                    matched_routes.add("General Network")
                    
                for r in matched_routes:
                    active_disruptions.append({
                        "route_name": r,
                        "effect": effect_str,
                        "replacement_bus_available": has_replacement_bus,
                        "description": header or desc or f"Service alert on {r}",
                        "active_periods": periods,
                        "delay_mins": 10.0 if effect_str == "DELAYED" else 0.0
                    })
        except Exception:
            continue
            
    return active_disruptions

def fetch_realtime_delays_and_cancellations(target_trip_id):
    """
    Fetches real-time GTFS and returns (delay_mins, is_cancelled) for the given trip ID.
    """
    headers = {"KeyID": API_KEY} if API_KEY else {}
    url = DIRECT_TRIP_UPDATES_URL
    
    try:
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            if response.content.startswith((b"<!DOCTYPE html", b"<html", b"<!doctype")):
                return 0, False
                
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)
            
            for entity in feed.entity:
                if entity.HasField('trip_update'):
                    trip = entity.trip_update.trip
                    if trip.trip_id == target_trip_id:
                        is_cancelled = (trip.schedule_relationship == 3)
                        delay = 0
                        for update in entity.trip_update.stop_time_update:
                            if update.HasField('departure') and update.departure.delay > 0:
                                delay = max(delay, update.departure.delay // 60)
                            if update.HasField('arrival') and update.arrival.delay > 0:
                                delay = max(delay, update.arrival.delay // 60)
                        return delay, is_cancelled
            return 0, False
    except Exception:
        pass
    return 0, False

def calculate_recommended_departure(start_address, destination_address, destination_arrival_time, 
                                    buffer_minutes=5, disruptions=None, cancelled_routes=None, 
                                    cancelled_trips=None, prefer_replacement_bus=True,
                                    fetch_live_alerts=True):
    print("=" * 70)
    print("MULTI-MODAL DIRECTIONAL GTFS-REALTIME COMMUTE ROUTE & DEPARTURE")
    print("=" * 70)
    
    target_arrival_dt = parse_arrival_datetime(destination_arrival_time)
    target_arrival_epoch = int(target_arrival_dt.timestamp())
    
    print(f"Origin Address       : {start_address}")
    print(f"Destination Address  : {destination_address}")
    print(f"Target Arrival Time  : {target_arrival_dt.strftime('%Y-%m-%d %I:%M %p (%H:%M)')}")
    print(f"Arrival Unix Epoch   : {target_arrival_epoch}")
    
    # 1. Fetch live disruptions from PTV API if not explicitly supplied or if requested
    all_disruptions = list(disruptions or [])
    if fetch_live_alerts and API_KEY and not disruptions:
        live_alerts = fetch_live_service_alerts(target_arrival_dt)
        if live_alerts:
            print(f"✓ Found {len(live_alerts)} active service disruptions matching timing from live PTV API.")
            all_disruptions.extend(live_alerts)
            
    if all_disruptions or cancelled_routes:
        routes_disrupted = [d.get('route_name', '') if isinstance(d, dict) else d for d in all_disruptions] + (cancelled_routes or [])
        print(f"Disrupted Routes     : {', '.join(filter(None, set(routes_disrupted)))}")
    print("-" * 70)
    
    # 2. Directional Routing Engine (with dynamic in-memory graph recomputation for disruptions)
    itinerary = directional_routing.calculate_directional_itinerary(
        start_address, 
        destination_address, 
        target_arrival_dt,
        disruptions=all_disruptions,
        cancelled_routes=cancelled_routes,
        cancelled_trips=cancelled_trips,
        prefer_replacement_bus=prefer_replacement_bus
    )
    
    if itinerary.get("status") != "Success":
        print(f"Routing Failed: {itinerary.get('message')}")
        sys.exit(1)
        
    print("\n--- RECOMMENDED MULTI-MODAL ITINERARY ---")
    
    real_time_delay_mins = 0
    cancelled_detected_in_realtime = []
    
    for leg in itinerary["legs"]:
        if leg["type"] == "TRANSIT" and not leg.get("is_replacement"):
            delay, is_canc = fetch_realtime_delays_and_cancellations(leg.get("trip_id"))
            if is_canc:
                print(f"🚨 Live Cancellation Detected for {leg.get('route', 'service')} (Trip ID: {leg.get('trip_id')})!")
                cancelled_detected_in_realtime.append(leg.get("trip_id"))
            elif delay > 0:
                real_time_delay_mins += delay
                print(f"⚠️  Live delay of {delay} mins detected on this service.")
        
        mode_str = leg.get('mode', 'Transit')
        mode_tag = f"[{mode_str}]"
        print(f"[{leg['start_time']} - {leg['end_time']}] {mode_tag:<18} {leg['instruction']}")
        
    # If live cancellation was detected mid-route, recompute graph in memory!
    if cancelled_detected_in_realtime:
        print("\n⚡ Recomputing in-memory graph to detour around cancelled live services...")
        all_cancelled_trips = list(set((cancelled_trips or []) + cancelled_detected_in_realtime))
        itinerary = directional_routing.calculate_directional_itinerary(
            start_address, 
            destination_address, 
            target_arrival_dt,
            disruptions=all_disruptions,
            cancelled_routes=cancelled_routes,
            cancelled_trips=all_cancelled_trips,
            prefer_replacement_bus=prefer_replacement_bus
        )
        print("\n--- UPDATED MULTI-MODAL ITINERARY (POST-RECOMPUTATION) ---")
        for leg in itinerary["legs"]:
            mode_str = leg.get('mode', 'Transit')
            mode_tag = f"[{mode_str}]"
            print(f"[{leg['start_time']} - {leg['end_time']}] {mode_tag:<18} {leg['instruction']}")
        
    total_travel_time = itinerary["total_travel_time_mins"]
    latest_departure_str = itinerary.get("latest_departure_time", "Unknown")
    computation_time = itinerary.get("computation_time_secs", 0.0)
    route_nodes = itinerary.get("route", [])
    
    # Calculate recommended departure with buffer and real-time delays
    dep_hour, dep_min = map(int, latest_departure_str.split(":"))
    base_dep_dt = datetime(target_arrival_dt.year, target_arrival_dt.month, target_arrival_dt.day, dep_hour, dep_min, 0)
    
    recommended_dep_dt = base_dep_dt - timedelta(minutes=(buffer_minutes + real_time_delay_mins))
    
    print("-" * 70)
    print(f"Computed Route Path    : {' -> '.join(route_nodes)}")
    if "modes_summary" in itinerary:
        print(f"Transit Modes Used     : {itinerary['modes_summary']}")
    if itinerary.get("replacement_buses_used"):
        print(f"Replacement Bus Alert  : ✓ Prioritized Rail Replacement Bus included in route")
    if "transfers_count" in itinerary:
        t_count = itinerary['transfers_count']
        transfers_str = f"{t_count} transfer{'s' if t_count != 1 else ''}" if t_count > 0 else "0 transfers (Direct)"
        print(f"Total Transfers        : {transfers_str}")
    print(f"Computation Time       : {computation_time:.3f} seconds")
    print(f"Total Base Travel Time : {total_travel_time} mins")
    print(f"Target Arrival Time    : {target_arrival_dt.strftime('%Y-%m-%d %I:%M %p (%H:%M)')} [Epoch: {target_arrival_epoch}]")
    print(f"Latest Trip Departure  : {latest_departure_str}")
    print(f"Real-Time Delay Extra  : +{real_time_delay_mins} mins")
    print(f"Safety Buffer          : +{buffer_minutes} mins")
    print(f"RECOMMENDED DEPARTURE  : {recommended_dep_dt.strftime('%I:%M %p (%Y-%m-%d %H:%M)')}")
    print("=" * 70)
    return itinerary

def parse_cli_args():
    parser = argparse.ArgumentParser(description="Multi-modal public transport departure calculator.")
    parser.add_argument("-s", "--start", type=str, default=None, help="Start free-text address")
    parser.add_argument("-d", "--destination", type=str, default=None, help="Destination free-text address")
    parser.add_argument("-t", "--arrival-time", type=str, default=None, help="Desired arrival time (HH:MM or YYYY-MM-DD HH:MM)")
    parser.add_argument("--arrival-timestamp", type=int, default=None, help="Desired arrival Unix epoch timestamp")
    parser.add_argument("-b", "--buffer", type=int, default=5, help="Safety buffer in minutes")
    parser.add_argument("--disrupt-route", "--cancel-route", dest="disrupt_route", type=str, default=None, 
                        help="Simulate a cancelled route (e.g. 'Sandringham') to test dynamic re-routing")
    parser.add_argument("--cancel-trip", dest="cancel_trip", type=str, default=None,
                        help="Simulate a cancelled trip ID")
    parser.add_argument("--no-replacement-bus", dest="no_replacement_bus", action="store_true", default=False,
                        help="Disable preference for replacement buses when testing detours")
    parser.add_argument("--no-live-alerts", dest="no_live_alerts", action="store_true", default=False,
                        help="Skip pulling live alerts from PTV API")
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_cli_args()
    
    start = args.start or input("Enter Start Address [default: 15 Collins St, Melbourne]: ").strip() or "15 Collins St, Melbourne"
    destination = args.destination or input("Enter Destination Address [default: Monash University Clayton]: ").strip() or "Monash University Clayton"
    
    if args.arrival_timestamp:
        arrival_time = args.arrival_timestamp
    else:
        arrival_time = args.arrival_time or input("Enter Target Arrival Time (HH:MM or YYYY-MM-DD HH:MM) [default: 15:00]: ").strip() or "15:00"
    
    disruptions = []
    if args.disrupt_route:
        for r in args.disrupt_route.split(','):
            disruptions.append({
                "route_name": r.strip(),
                "effect": "NO_SERVICE",
                "replacement_bus_available": not args.no_replacement_bus,
                "description": f"Service suspended on {r.strip()} line. Replacement buses operating."
            })
            
    cancelled_trips = [args.cancel_trip.strip()] if args.cancel_trip else None
    
    calculate_recommended_departure(
        start, 
        destination, 
        arrival_time, 
        args.buffer,
        disruptions=disruptions,
        cancelled_trips=cancelled_trips,
        prefer_replacement_bus=not args.no_replacement_bus,
        fetch_live_alerts=not args.no_live_alerts
    )