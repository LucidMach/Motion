import unittest
import math
import sqlite3
import os
import sys
import tempfile
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import directional_routing


class TestDirectionalRouting(unittest.TestCase):

    def test_get_mode_name(self):
        self.assertEqual(directional_routing.get_mode_name(0), 'Tram')
        self.assertEqual(directional_routing.get_mode_name(900), 'Tram')
        self.assertEqual(directional_routing.get_mode_name(2), 'Train')
        self.assertEqual(directional_routing.get_mode_name(400), 'Train')
        self.assertEqual(directional_routing.get_mode_name(100), 'Train')
        self.assertEqual(directional_routing.get_mode_name(3), 'Bus')
        self.assertEqual(directional_routing.get_mode_name(701), 'Bus')
        self.assertEqual(directional_routing.get_mode_name(200), 'Bus')
        self.assertEqual(directional_routing.get_mode_name(4), 'Ferry')
        self.assertEqual(directional_routing.get_mode_name(1000), 'Ferry')
        self.assertEqual(directional_routing.get_mode_name(None), 'Transit')

    def test_bearing_calculation(self):
        # Due North
        b_north = directional_routing.calculate_bearing(0.0, 0.0, 1.0, 0.0)
        self.assertAlmostEqual(b_north, 0.0, delta=0.5)

        # Due East
        b_east = directional_routing.calculate_bearing(0.0, 0.0, 0.0, 1.0)
        self.assertAlmostEqual(b_east, 90.0, delta=0.5)

        # Due South
        b_south = directional_routing.calculate_bearing(1.0, 0.0, 0.0, 0.0)
        self.assertAlmostEqual(b_south, 180.0, delta=0.5)

        # Due West
        b_west = directional_routing.calculate_bearing(0.0, 1.0, 0.0, 0.0)
        self.assertAlmostEqual(b_west, 270.0, delta=0.5)

    def test_angle_difference(self):
        self.assertEqual(directional_routing.get_angle_diff(10, 30), 20)
        self.assertEqual(directional_routing.get_angle_diff(350, 10), 20)
        self.assertEqual(directional_routing.get_angle_diff(0, 180), 180)
        self.assertEqual(directional_routing.get_angle_diff(10, 200), 170)

    def test_haversine_and_walking_time(self):
        # ~111 km between 1 degree of latitude
        dist = directional_routing.haversine(0.0, 0.0, 1.0, 0.0)
        self.assertGreater(dist, 110)
        self.assertLess(dist, 112)

        # 5 km at 5 km/h walking speed should take 60 minutes
        w_time = directional_routing.walking_time_mins(5.0)
        self.assertAlmostEqual(w_time, 60.0, delta=0.1)

    def test_directional_stop_selection(self):
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.execute("""
            CREATE TABLE stops (
                stop_id TEXT PRIMARY KEY,
                stop_name TEXT,
                stop_lat REAL,
                stop_lon REAL
            )
        """)
        c.executemany("INSERT INTO stops VALUES (?, ?, ?, ?)", [
            ('S_FAR', 'Far Stop', -37.8200, 144.9600),
            ('S_CLOSE', 'Close Stop', -37.8110, 144.9600),
            ('S_MID', 'Mid Stop', -37.8150, 144.9600),
        ])
        conn.commit()

        stops = directional_routing.get_directional_nearby_stops(conn, -37.8100, 144.9600, radius=2.0)
        
        self.assertGreater(len(stops), 0)
        self.assertEqual(stops[0]['stop_id'], 'S_CLOSE')
        self.assertEqual(stops[1]['stop_id'], 'S_MID')
        self.assertEqual(stops[2]['stop_id'], 'S_FAR')
        conn.close()

    def test_offline_geocoding(self):
        coords_richmond = directional_routing.geocode_address('Richmond')
        self.assertIsNotNone(coords_richmond)
        self.assertAlmostEqual(coords_richmond[0], -37.8240, places=2)

        coords_finkel = directional_routing.geocode_address('Alan Finkel Building')
        self.assertIsNotNone(coords_finkel)
        self.assertAlmostEqual(coords_finkel[0], -37.9135, places=2)

    def test_backwards_transit_leg_query(self):
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE routes (route_id TEXT, route_short_name TEXT, route_type INTEGER);
            CREATE TABLE trips (route_id TEXT, trip_id TEXT);
            CREATE TABLE stop_times (
                trip_id TEXT, stop_id TEXT, stop_sequence INTEGER, 
                arrival_time_secs INTEGER, departure_time_secs INTEGER
            );
            
            INSERT INTO routes VALUES ('R1', 'Train 101', 400);
            INSERT INTO trips VALUES ('R1', 'T1');
            INSERT INTO trips VALUES ('R1', 'T2');
            
            -- Trip 1: 08:00 -> 08:30 (28800 -> 30600)
            INSERT INTO stop_times VALUES ('T1', 'STOP_A', 1, 28800, 28800);
            INSERT INTO stop_times VALUES ('T1', 'STOP_B', 2, 30600, 30600);
            
            -- Trip 2: 08:30 -> 09:00 (30600 -> 32400)
            INSERT INTO stop_times VALUES ('T2', 'STOP_A', 1, 30600, 30600);
            INSERT INTO stop_times VALUES ('T2', 'STOP_B', 2, 32400, 32400);
        """)
        conn.commit()

        # Target arrival: 09:15 (33300) -> should pick T2 (arrives 09:00)
        leg = directional_routing.get_latest_transit_leg_backward(conn, 'STOP_A', 'STOP_B', 33300)
        self.assertIsNotNone(leg)
        self.assertEqual(leg['trip_id'], 'T2')
        self.assertEqual(leg['mode'], 'Train')
        self.assertEqual(leg['arrival_secs'], 32400)
        self.assertEqual(leg['departure_secs'], 30600)

        # Target arrival: 08:45 (31500) -> should pick T1 (arrives 08:30)
        leg2 = directional_routing.get_latest_transit_leg_backward(conn, 'STOP_A', 'STOP_B', 31500)
        self.assertIsNotNone(leg2)
        self.assertEqual(leg2['trip_id'], 'T1')
        self.assertEqual(leg2['mode'], 'Train')
        conn.close()

    def test_backwards_transit_leg_skips_cancelled_trips(self):
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE routes (route_id TEXT, route_short_name TEXT, route_type INTEGER);
            CREATE TABLE trips (route_id TEXT, trip_id TEXT);
            CREATE TABLE stop_times (
                trip_id TEXT, stop_id TEXT, stop_sequence INTEGER, 
                arrival_time_secs INTEGER, departure_time_secs INTEGER
            );
            
            INSERT INTO routes VALUES ('R1', 'Sandringham', 400);
            INSERT INTO trips VALUES ('R1', 'T1');
            INSERT INTO trips VALUES ('R1', 'T2_CANCELLED');
            
            INSERT INTO stop_times VALUES ('T1', 'STOP_A', 1, 28800, 28800);
            INSERT INTO stop_times VALUES ('T1', 'STOP_B', 2, 30600, 30600);
            
            INSERT INTO stop_times VALUES ('T2_CANCELLED', 'STOP_A', 1, 30600, 30600);
            INSERT INTO stop_times VALUES ('T2_CANCELLED', 'STOP_B', 2, 32400, 32400);
        """)
        conn.commit()

        # Target arrival: 09:15 (33300). T2_CANCELLED is cancelled, should fall back to T1!
        leg = directional_routing.get_latest_transit_leg_backward(
            conn, 'STOP_A', 'STOP_B', 33300, 
            cancelled_trips=['T2_CANCELLED']
        )
        self.assertIsNotNone(leg)
        self.assertEqual(leg['trip_id'], 'T1')
        conn.close()

    def test_in_memory_graph_replacement_bus_injection(self):
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE transit_network_edges (
                from_stop_id TEXT, to_stop_id TEXT, route_type INTEGER, route_short_name TEXT, avg_travel_time REAL
            );
            CREATE TABLE transfer_edges (from_stop_id TEXT, to_stop_id TEXT, distance_km REAL, walk_time_mins REAL);
            
            INSERT INTO stops VALUES ('S1', 'Station A', -37.8200, 144.9600);
            INSERT INTO stops VALUES ('S2', 'Station B', -37.8250, 144.9700);
            
            INSERT INTO transit_network_edges VALUES ('S1', 'S2', 400, 'Sandringham', 300.0);
        """)
        conn.commit()

        # Recompute graph with Sandringham line suspended and replacement buses enabled
        G = directional_routing.build_directional_spatial_graph(
            conn, -37.8200, 144.9600, -37.8250, 144.9700,
            disruptions=[{"route_name": "Sandringham", "effect": "NO_SERVICE", "replacement_bus_available": True}],
            prefer_replacement_bus=True
        )

        self.assertTrue(G.has_edge('S1', 'S2'))
        edge = G['S1']['S2']
        self.assertEqual(edge['mode'], 'Replacement Bus')
        self.assertTrue(edge.get('is_replacement'))
        self.assertIn('Replacement Bus', edge['route'])
        conn.close()

    def test_in_memory_graph_pruning_without_replacement_bus(self):
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE transit_network_edges (
                from_stop_id TEXT, to_stop_id TEXT, route_type INTEGER, route_short_name TEXT, avg_travel_time REAL
            );
            CREATE TABLE transfer_edges (from_stop_id TEXT, to_stop_id TEXT, distance_km REAL, walk_time_mins REAL);
            
            INSERT INTO stops VALUES ('S1', 'Station A', -37.8200, 144.9600);
            INSERT INTO stops VALUES ('S2', 'Station B', -37.8250, 144.9700);
            
            INSERT INTO transit_network_edges VALUES ('S1', 'S2', 400, 'Sandringham', 300.0);
        """)
        conn.commit()

        # Disruption with NO replacement bus
        G = directional_routing.build_directional_spatial_graph(
            conn, -37.8200, 144.9600, -37.8250, 144.9700,
            disruptions=[{"route_name": "Sandringham", "effect": "NO_SERVICE", "replacement_bus_available": False}],
            prefer_replacement_bus=False
        )

        # Edge should be completely removed/pruned
        self.assertFalse(G.has_edge('S1', 'S2'))
        conn.close()

    def test_bbox_padding_is_capped_for_long_distance_queries(self):
        """
        Regression test for the OOM bug: a single request's corridor bbox
        must not scale unboundedly with trip distance. Without the cap, a
        long-distance query (e.g. a geocoding mismatch resolving far apart)
        could pull a huge slice of the network into one request's in-memory
        graph.
        """
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE transit_network_edges (
                from_stop_id TEXT, to_stop_id TEXT, route_type INTEGER, route_short_name TEXT, avg_travel_time REAL
            );
            CREATE TABLE transfer_edges (from_stop_id TEXT, to_stop_id TEXT, distance_km REAL, walk_time_mins REAL);
        """)
        # Origin/destination ~1111km apart (10 degrees of latitude) - the old
        # uncapped formula (dist_km * 0.15 / 111) would pad the bbox by
        # ~1.5 degrees; capped, it's clamped to MAX_BBOX_PAD_DEG (0.35).
        origin_lat, origin_lon = 0.0, 0.0
        dest_lat, dest_lon = 10.0, 0.0

        # Within the capped bbox (min_lat ~= -0.35)
        c.execute("INSERT INTO stops VALUES ('NEAR', 'Near Stop', -0.1, 0.1)")
        # Outside the capped bbox but would have been inside the old
        # uncapped one (~-1.5 to 11.5)
        c.execute("INSERT INTO stops VALUES ('FAR', 'Far Stop', -1.0, 0.1)")
        conn.commit()

        bbox_data = directional_routing.fetch_spatial_bbox_data(conn, origin_lat, origin_lon, dest_lat, dest_lon)

        self.assertIn('NEAR', bbox_data['stops_in_bbox'])
        self.assertNotIn('FAR', bbox_data['stops_in_bbox'])
        conn.close()

    def test_bbox_fetch_returns_all_stops_within_the_capped_corridor(self):
        """
        Companion to the padding-cap test above: within the (capped) bbox,
        every matching stop must be returned - no row-count LIMIT should
        truncate results, since an unordered LIMIT would silently drop
        arbitrary rows (including ones near the actual origin/destination)
        rather than the least relevant ones. This was a real bug: a LIMIT
        added here broke a legitimate ~20km cross-metro route by cutting off
        stops near the destination.
        """
        conn = sqlite3.connect(":memory:")
        c = conn.cursor()
        c.executescript("""
            CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
            CREATE TABLE transit_network_edges (
                from_stop_id TEXT, to_stop_id TEXT, route_type INTEGER, route_short_name TEXT, avg_travel_time REAL
            );
            CREATE TABLE transfer_edges (from_stop_id TEXT, to_stop_id TEXT, distance_km REAL, walk_time_mins REAL);
        """)
        count = 5200  # comfortably more than any single old row-count cap would have allowed
        # Small enough increment that all `count` stops land within the
        # actual (~0.06 deg pad) bbox for two nearby origin/destination points.
        c.executemany(
            "INSERT INTO stops VALUES (?, ?, ?, ?)",
            [(f"S{i}", f"Stop {i}", -37.8 + (i * 0.000001), 144.9 + (i * 0.000001)) for i in range(count)]
        )
        conn.commit()

        bbox_data = directional_routing.fetch_spatial_bbox_data(conn, -37.8, 144.9, -37.81, 144.91)
        self.assertEqual(len(bbox_data['stops_in_bbox']), count)
        conn.close()

    def test_itinerary_rejects_out_of_area_trips_instead_of_loading_the_whole_dataset(self):
        """
        Regression test for the real OOM scenario: for a genuinely distant
        origin/destination pair, the corridor bbox has to span both points
        regardless of padding, so it ends up covering nearly the entire
        dataset. calculate_directional_itinerary must reject clearly
        out-of-area trips outright rather than attempt to build a graph
        across that whole span.
        """
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL);
                CREATE TABLE transit_network_edges (
                    from_stop_id TEXT, to_stop_id TEXT, route_type INTEGER, route_short_name TEXT, avg_travel_time REAL
                );
                CREATE TABLE transfer_edges (from_stop_id TEXT, to_stop_id TEXT, distance_km REAL, walk_time_mins REAL);
            """)
            conn.commit()
            conn.close()

            # Melbourne CBD -> roughly Sydney (~700km+ apart)
            result = directional_routing.calculate_directional_itinerary(
                start_address="-37.8136,144.9631",
                dest_address="-33.8688,151.2093",
                arrival_dt=datetime(2026, 1, 1, 9, 0, 0),
                db_path=path,
            )
            self.assertEqual(result["status"], "Error")
            self.assertIn("service area", result["message"])
        finally:
            os.remove(path)

if __name__ == '__main__':
    unittest.main()
