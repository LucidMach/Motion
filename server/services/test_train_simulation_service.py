import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.services.train_simulation_service import (
    get_active_train_positions,
    get_active_train_positions_geojson,
)

SCHEMA = """
CREATE TABLE routes (route_id TEXT, route_short_name TEXT, route_long_name TEXT, route_type INTEGER);
CREATE TABLE trips (route_id TEXT, service_id TEXT, trip_id TEXT, direction_id INTEGER);
CREATE TABLE stops (stop_id TEXT, stop_name TEXT, stop_lat REAL, stop_lon REAL, location_type TEXT, parent_station TEXT);
CREATE TABLE stop_times (trip_id TEXT, arrival_time TEXT, departure_time TEXT, stop_id TEXT, stop_sequence INTEGER, arrival_time_secs INTEGER, departure_time_secs INTEGER);
CREATE TABLE calendar (service_id TEXT, monday INTEGER, tuesday INTEGER, wednesday INTEGER, thursday INTEGER, friday INTEGER, saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
CREATE TABLE calendar_dates (service_id TEXT, date TEXT, exception_type INTEGER);
"""

# 2026-09-21 is a Monday; used as the fixed "today" for every test.
MONDAY = "20260921"


class TrainSimulationServiceTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.conn = sqlite3.connect(self.db_path)
        self.conn.executescript(SCHEMA)
        self.conn.commit()

        # A Monday-only service, valid for the whole month.
        self._insert_calendar("S_MON", monday=1, start="20260901", end="20260930")

        # route_id "R1" / trip "T1" travels due north: stop A (lat 0) -> stop B (lat 0.01, ~1.1km)
        # -> stop C (lat 0.02), each leg scheduled to take exactly 100 seconds.
        self._insert_route("R1", "TestLine", route_type=400)
        self._insert_trip("R1", "S_MON", "T1")
        self._insert_stop("A", 0.0, 0.0)
        self._insert_stop("B", 0.01, 0.0)
        self._insert_stop("C", 0.02, 0.0)
        self._insert_stop_time("T1", "A", 1, arr=1000, dep=1000)
        self._insert_stop_time("T1", "B", 2, arr=1100, dep=1100)
        self._insert_stop_time("T1", "C", 3, arr=1200, dep=1200)

        self.conn.commit()
        self.conn.close()

    def tearDown(self):
        os.remove(self.db_path)

    # --- fixture helpers -------------------------------------------------

    def _insert_calendar(self, service_id, monday=0, tuesday=0, wednesday=0, thursday=0,
                          friday=0, saturday=0, sunday=0, start="20260101", end="20261231"):
        self.conn.execute(
            "INSERT INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start, end),
        )

    def _insert_calendar_date(self, service_id, date, exception_type):
        self.conn.execute(
            "INSERT INTO calendar_dates VALUES (?,?,?)", (service_id, date, exception_type)
        )

    def _insert_route(self, route_id, short_name, route_type=400, long_name=""):
        self.conn.execute(
            "INSERT INTO routes VALUES (?,?,?,?)", (route_id, short_name, long_name, route_type)
        )

    def _insert_trip(self, route_id, service_id, trip_id, direction_id=0):
        self.conn.execute(
            "INSERT INTO trips VALUES (?,?,?,?)", (route_id, service_id, trip_id, direction_id)
        )

    def _insert_stop(self, stop_id, lat, lon):
        self.conn.execute(
            "INSERT INTO stops VALUES (?,?,?,?,?,?)", (stop_id, stop_id, lat, lon, "0", "")
        )

    def _insert_stop_time(self, trip_id, stop_id, seq, arr, dep):
        self.conn.execute(
            "INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)",
            (trip_id, str(arr), str(dep), stop_id, seq, arr, dep),
        )

    def _positions_at(self, hh, mm, ss, day="20260921"):
        year, month, day_num = int(day[:4]), int(day[4:6]), int(day[6:8])
        now = datetime(year, month, day_num, hh, mm, ss)
        return get_active_train_positions(now=now, db_path=self.db_path)

    # --- tests -------------------------------------------------------------

    def test_interpolates_midway_between_stops(self):
        # Midpoint of the A->B leg (1000s to 1100s) is 1050s = 00:17:30.
        positions = self._positions_at(0, 17, 30)
        self.assertEqual(len(positions), 1)
        p = positions[0]
        self.assertAlmostEqual(p["progress"], 0.5, places=3)
        self.assertAlmostEqual(p["lat"], 0.005, places=6)
        self.assertAlmostEqual(p["lon"], 0.0, places=6)

    def test_bearing_points_due_north(self):
        positions = self._positions_at(0, 17, 30)
        self.assertAlmostEqual(positions[0]["bearing_deg"], 0.0, places=3)

    def test_no_positions_before_trip_starts(self):
        positions = self._positions_at(0, 0, 0)  # midnight, well before 1000s (00:16:40)
        self.assertEqual(positions, [])

    def test_no_positions_after_trip_ends(self):
        positions = self._positions_at(1, 0, 0)  # 1am, well after the trip finishes at 1200s
        self.assertEqual(positions, [])

    def test_service_not_running_on_wrong_weekday(self):
        # 2026-09-22 is a Tuesday; the S_MON service shouldn't run.
        positions = self._positions_at(0, 17, 30, day="20260922")
        self.assertEqual(positions, [])

    def test_calendar_dates_exception_cancels_service(self):
        self.conn = sqlite3.connect(self.db_path)
        self._insert_calendar_date("S_MON", MONDAY, exception_type=2)  # removed
        self.conn.commit()
        self.conn.close()

        positions = self._positions_at(0, 17, 30)
        self.assertEqual(positions, [])

    def test_calendar_dates_exception_adds_service(self):
        self.conn = sqlite3.connect(self.db_path)
        # A service that normally never runs, added just for this one Monday.
        self._insert_calendar("S_NEVER", start="20260101", end="20261231")
        self._insert_trip("R1", "S_NEVER", "T2")
        self._insert_stop_time("T2", "A", 1, arr=2000, dep=2000)
        self._insert_stop_time("T2", "B", 2, arr=2100, dep=2100)
        self._insert_calendar_date("S_NEVER", MONDAY, exception_type=1)  # added
        self.conn.commit()
        self.conn.close()

        positions = self._positions_at(0, 34, 10)  # 2050s, midway through T2's leg
        trip_ids = {p["trip_id"] for p in positions}
        self.assertIn("T2", trip_ids)

    def test_overnight_trip_attributed_to_previous_service_day(self):
        # A trip timed at 24:xx:xx belongs to the *previous* calendar day's
        # service, per GTFS convention, even though it's physically after midnight.
        self.conn = sqlite3.connect(self.db_path)
        self._insert_trip("R1", "S_MON", "T_NIGHT")
        self._insert_stop_time("T_NIGHT", "A", 1, arr=86300, dep=86300)  # 23:58:20 "Monday"
        self._insert_stop_time("T_NIGHT", "B", 2, arr=86500, dep=86500)  # 24:01:40 "Monday" == 00:01:40 Tuesday
        self.conn.commit()
        self.conn.close()

        # Real wall-clock time is Tuesday 00:00:20 - 120s after A's 23:58:20
        # departure, i.e. 120/200 of the way through the 200s leg.
        positions = self._positions_at(0, 0, 20, day="20260922")
        trip_ids = {p["trip_id"]: p for p in positions}
        self.assertIn("T_NIGHT", trip_ids)
        self.assertAlmostEqual(trip_ids["T_NIGHT"]["progress"], 120 / 200, places=3)

    def test_replacement_bus_excluded(self):
        self.conn = sqlite3.connect(self.db_path)
        self._insert_route("R2", "Replacement Bus", route_type=400, long_name="Alamein - City")
        self._insert_trip("R2", "S_MON", "T_BUS")
        self._insert_stop_time("T_BUS", "A", 1, arr=1000, dep=1000)
        self._insert_stop_time("T_BUS", "B", 2, arr=1100, dep=1100)
        self.conn.commit()
        self.conn.close()

        positions = self._positions_at(0, 17, 30)
        trip_ids = {p["trip_id"] for p in positions}
        self.assertNotIn("T_BUS", trip_ids)

    @patch("server.services.train_simulation_service.get_all_routes_metadata")
    def test_color_resolved_from_route_metadata(self, mock_get_routes):
        mock_get_routes.return_value = [
            {"route_short_name": "TestLine", "color": "#ABCDEF"}
        ]
        positions = self._positions_at(0, 17, 30)
        self.assertEqual(positions[0]["color"], "#ABCDEF")

    @patch("server.services.train_simulation_service.get_all_routes_metadata")
    def test_unknown_route_falls_back_to_default_color(self, mock_get_routes):
        mock_get_routes.return_value = []
        positions = self._positions_at(0, 17, 30)
        self.assertEqual(positions[0]["color"], "#0072CE")

    def test_geojson_wrapper_shapes_features_correctly(self):
        now = datetime(2026, 9, 21, 0, 17, 30)
        fc = get_active_train_positions_geojson(now=now, db_path=self.db_path)
        self.assertEqual(fc["type"], "FeatureCollection")
        self.assertEqual(len(fc["features"]), 1)
        feature = fc["features"][0]
        self.assertEqual(feature["geometry"]["type"], "Point")
        lon, lat = feature["geometry"]["coordinates"]
        self.assertAlmostEqual(lat, 0.005, places=6)
        self.assertAlmostEqual(lon, 0.0, places=6)
        self.assertEqual(feature["properties"]["trip_id"], "T1")


if __name__ == "__main__":
    unittest.main()
