import os
import sys
import unittest
from fastapi.testclient import TestClient

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.main import app

class TestFastAPIBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_root_and_health(self):
        """Test root index and health endpoints."""
        res_root = self.client.get("/")
        self.assertEqual(res_root.status_code, 200)
        self.assertIn("endpoints", res_root.json())

        res_health = self.client.get("/api/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json()["status"], "ok")

    def test_02_system_status(self):
        """Test system telemetry and database status endpoint."""
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("db_exists", data)
        self.assertIn("stops_count", data)
        self.assertIn("transit_edges_count", data)

    def test_03_stop_search_and_nearby(self):
        """Test stop autocomplete search and nearby radius querying."""
        # 1. Search known station
        res = self.client.get("/api/stops/search?q=Richmond&limit=5")
        self.assertEqual(res.status_code, 200)
        results = res.json()
        self.assertTrue(len(results) > 0)
        self.assertTrue(any("Richmond" in r["stop_name"] for r in results))

        # 2. Search landmark
        res_lm = self.client.get("/api/stops/search?q=Monash&limit=5")
        self.assertEqual(res_lm.status_code, 200)
        lm_results = res_lm.json()
        self.assertTrue(len(lm_results) > 0)

        # 3. Nearby stops around Flinders St coords
        res_nearby = self.client.get("/api/stops/nearby?lat=-37.8180&lon=144.9671&radius_km=1.0&limit=5")
        self.assertEqual(res_nearby.status_code, 200)
        nearby_results = res_nearby.json()
        self.assertTrue(len(nearby_results) > 0)

    def test_04_network_geojson_and_routes(self):
        """Test network lines and stations GeoJSON endpoints."""
        # 1. Metro Lines GeoJSON
        res_lines = self.client.get("/api/network/metro/lines")
        self.assertEqual(res_lines.status_code, 200)
        lines_data = res_lines.json()
        self.assertEqual(lines_data.get("type"), "FeatureCollection")
        self.assertTrue(len(lines_data.get("features", [])) > 0)

        first_line = lines_data["features"][0]
        self.assertEqual(first_line.get("geometry", {}).get("type"), "LineString")
        self.assertIn("color", first_line.get("properties", {}))
        self.assertIn("route_short_name", first_line.get("properties", {}))

        # 2. Metro Stations GeoJSON
        res_stations = self.client.get("/api/network/metro/stations")
        self.assertEqual(res_stations.status_code, 200)
        stations_data = res_stations.json()
        self.assertEqual(stations_data.get("type"), "FeatureCollection")
        self.assertTrue(len(stations_data.get("features", [])) > 0)

        first_st = stations_data["features"][0]
        self.assertEqual(first_st.get("geometry", {}).get("type"), "Point")
        self.assertIn("stop_name", first_st.get("properties", {}))

        # 3. Route metadata list
        res_routes = self.client.get("/api/network/routes")
        self.assertEqual(res_routes.status_code, 200)
        routes = res_routes.json()
        self.assertTrue(len(routes) > 0)
        self.assertTrue(any(r.get("route_short_name") == "Belgrave" for r in routes))

    def test_05_route_calculation(self):
        """Test end-to-end multi-modal routing calculation via POST /api/route."""
        payload = {
            "origin": "Richmond",
            "destination": "Footscray",
            "arrival_time": "2026-08-20 09:15",
            "buffer_minutes": 10,
            "prefer_replacement_bus": True,
            "fetch_live_alerts": False
        }
        res = self.client.post("/api/route", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "Success")
        self.assertIsNotNone(data.get("recommended_departure_time"))
        self.assertIsNotNone(data.get("total_travel_time_mins"))
        self.assertTrue(len(data.get("legs", [])) > 0)
        
        # Verify turn-by-turn legs have instruction and duration
        for leg in data["legs"]:
            self.assertIn("instruction", leg)
            self.assertIn("start_time", leg)
            self.assertIn("end_time", leg)

    def test_06_route_with_disruption_simulation(self):
        """Test route calculation with simulated cancelled route detour."""
        payload = {
            "origin": "Richmond",
            "destination": "Footscray",
            "arrival_time": "2026-08-20 09:15",
            "buffer_minutes": 10,
            "cancelled_routes": ["Sandringham"],
            "prefer_replacement_bus": False,
            "fetch_live_alerts": False
        }
        res = self.client.post("/api/route", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "Success")


if __name__ == "__main__":
    unittest.main()
