import os
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.services.route_shape_service import get_routes_for_mode, get_route_shape

SCHEMA = """
CREATE TABLE routes (route_id TEXT, route_short_name TEXT, route_long_name TEXT, route_type INTEGER);
CREATE TABLE trips (route_id TEXT, service_id TEXT, trip_id TEXT, direction_id INTEGER);
CREATE TABLE stops (stop_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL, location_type TEXT, parent_station TEXT);
CREATE TABLE stop_times (trip_id TEXT, arrival_time TEXT, departure_time TEXT, stop_id TEXT, stop_sequence INTEGER, arrival_time_secs INTEGER, departure_time_secs INTEGER);
"""


class RouteShapeServiceTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = sqlite3.connect(self.db_path)
        conn.executescript(SCHEMA)

        # Tram route "1" with two directions, plus a distinct tram route "11".
        conn.execute("INSERT INTO routes VALUES (?,?,?,?)", ("T1_OUT", "1", "A - B (Tram)", 0))
        conn.execute("INSERT INTO routes VALUES (?,?,?,?)", ("T1_IN", "1", "B - A (Tram)", 0))
        conn.execute("INSERT INTO routes VALUES (?,?,?,?)", ("T11", "11", "C - D (Tram)", 0))
        # A bus route sharing the same short_name "1" as the tram, to prove mode filtering.
        conn.execute("INSERT INTO routes VALUES (?,?,?,?)", ("BUS1", "1", "E - F (Bus)", 3))

        conn.execute("INSERT INTO trips VALUES (?,?,?,?)", ("T1_OUT", "S1", "trip_out", 0))
        conn.execute("INSERT INTO trips VALUES (?,?,?,?)", ("T1_IN", "S1", "trip_in", 1))
        conn.execute("INSERT INTO trips VALUES (?,?,?,?)", ("BUS1", "S1", "trip_bus", 0))

        for stop_id, lat, lon in [("SA", 0.0, 0.0), ("SB", 0.01, 0.0), ("SC", 0.02, 0.0)]:
            conn.execute("INSERT INTO stops VALUES (?,?,?,?,?,?)", (stop_id, stop_id, lat, lon, "0", ""))

        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_out", "0", "0", "SA", 1, 0, 0))
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_out", "100", "100", "SB", 2, 100, 100))
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_out", "200", "200", "SC", 3, 200, 200))
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_in", "0", "0", "SC", 1, 0, 0))
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_in", "100", "100", "SA", 2, 100, 100))
        # A bus trip with only one stop_time row - too short to form a line, should be dropped.
        conn.execute("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)", ("trip_bus", "0", "0", "SA", 1, 0, 0))

        conn.commit()
        conn.close()

        self.db_patcher = patch("server.services.route_shape_service.DB_NAME", self.db_path)
        self.db_patcher.start()

    def tearDown(self):
        self.db_patcher.stop()
        os.remove(self.db_path)

    def test_get_routes_for_mode_filters_by_route_type(self):
        trams = get_routes_for_mode("tram")
        names = {r["route_short_name"] for r in trams}
        self.assertEqual(names, {"1", "11"})
        for r in trams:
            self.assertEqual(r["color"], "#78BE20")
            self.assertEqual(r["mode"], "tram")

    def test_get_routes_for_mode_dedups_shared_short_name_across_route_ids(self):
        trams = get_routes_for_mode("tram")
        # Tram "1" exists as two route_ids (T1_OUT/T1_IN) but should appear once.
        matching = [r for r in trams if r["route_short_name"] == "1"]
        self.assertEqual(len(matching), 1)

    def test_get_routes_for_mode_unknown_mode_returns_empty(self):
        self.assertEqual(get_routes_for_mode("ferry"), [])

    def test_get_route_shape_builds_one_linestring_per_direction(self):
        shape = get_route_shape("tram", "1")
        self.assertEqual(len(shape["features"]), 2)
        directions = {f["properties"]["direction_id"] for f in shape["features"]}
        self.assertEqual(directions, {0, 1})
        for f in shape["features"]:
            self.assertEqual(f["geometry"]["type"], "LineString")
            self.assertEqual(f["properties"]["color"], "#78BE20")

    def test_get_route_shape_respects_mode_filter(self):
        # Bus route "1" exists too, but asking for tram "1" must not pull in the bus shape.
        shape = get_route_shape("tram", "1")
        for f in shape["features"]:
            self.assertEqual(f["properties"]["mode"], "tram")

    def test_get_route_shape_drops_trips_with_fewer_than_two_stops(self):
        shape = get_route_shape("bus", "1")
        self.assertEqual(shape["features"], [])

    def test_get_route_shape_unknown_mode_returns_empty(self):
        shape = get_route_shape("ferry", "1")
        self.assertEqual(shape, {"type": "FeatureCollection", "features": []})

    @patch("server.services.route_shape_service.get_all_routes_metadata")
    def test_get_routes_for_mode_train_delegates_to_metro_metadata(self, mock_metadata):
        mock_metadata.return_value = [{"route_short_name": "Belgrave", "color": "#152C6B"}]
        self.assertEqual(get_routes_for_mode("train"), mock_metadata.return_value)

    @patch("server.services.route_shape_service.get_metro_lines_geojson")
    def test_get_route_shape_train_filters_metro_lines_by_short_name(self, mock_lines):
        mock_lines.return_value = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"route_short_name": "Belgrave"}, "geometry": {}},
                {"type": "Feature", "properties": {"route_short_name": "Frankston"}, "geometry": {}},
            ],
        }
        shape = get_route_shape("train", "Belgrave")
        self.assertEqual(len(shape["features"]), 1)
        self.assertEqual(shape["features"][0]["properties"]["route_short_name"], "Belgrave")


if __name__ == "__main__":
    unittest.main()
