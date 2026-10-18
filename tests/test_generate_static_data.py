import os
import sys
import json
import sqlite3
import tempfile
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.generate_static_transit_data import (
    extract_all_routes,
    extract_all_route_stops,
    extract_all_route_shapes,
    generate_static_transit_bundle,
)
from directional_routing.directional_routing import DB_NAME


class TestGenerateStaticTransitData(unittest.TestCase):
    """Tests the static transit data generation script ensuring deterministic,
    complete, and validated datasets for trains, trams, and buses."""

    @classmethod
    def setUpClass(cls):
        if not os.path.exists(DB_NAME):
            raise unittest.SkipTest(f"Database {DB_NAME} not found")

    def test_extract_all_routes_structure(self):
        routes = extract_all_routes()
        self.assertIn("train", routes)
        self.assertIn("tram", routes)
        self.assertIn("bus", routes)

        # Check train routes
        train_routes = routes["train"]
        self.assertGreater(len(train_routes), 10)
        route_names = [r["route_short_name"] for r in train_routes]
        self.assertIn("Lilydale", route_names)
        self.assertIn("Frankston", route_names)
        self.assertIn("Cranbourne", route_names)

        for r in train_routes:
            self.assertIn("route_short_name", r)
            self.assertIn("color", r)
            self.assertTrue(r["color"].startswith("#"))
            self.assertIn("mode", r)
            self.assertEqual(r["mode"], "train")

        # Check tram routes
        tram_routes = routes["tram"]
        self.assertGreater(len(tram_routes), 10)
        for r in tram_routes:
            self.assertEqual(r["mode"], "tram")
            self.assertTrue(r["color"].startswith("#"))

        # Check bus routes
        bus_routes = routes["bus"]
        self.assertGreater(len(bus_routes), 50)
        for r in bus_routes:
            self.assertEqual(r["mode"], "bus")
            self.assertTrue(r["color"].startswith("#"))

    def test_extract_all_route_stops(self):
        route_stops = extract_all_route_stops()
        self.assertIsInstance(route_stops, dict)

        # Check Lilydale train stops
        self.assertIn("train:Lilydale", route_stops)
        lilydale_stops = route_stops["train:Lilydale"]
        self.assertGreater(len(lilydale_stops), 10)

        first_stop = lilydale_stops[0]
        self.assertIn("stop_id", first_stop)
        self.assertIn("stop_name", first_stop)
        self.assertIn("stop_lat", first_stop)
        self.assertIn("stop_lon", first_stop)
        self.assertIn("stop_sequence", first_stop)
        self.assertIn("is_interchange", first_stop)

        # Check at least one tram and bus
        tram_keys = [k for k in route_stops.keys() if k.startswith("tram:")]
        self.assertGreater(len(tram_keys), 5)
        bus_keys = [k for k in route_stops.keys() if k.startswith("bus:")]
        self.assertGreater(len(bus_keys), 10)

    def test_extract_all_route_shapes(self):
        shapes_fc = extract_all_route_shapes()
        self.assertEqual(shapes_fc.get("type"), "FeatureCollection")
        features = shapes_fc.get("features", [])
        self.assertGreater(len(features), 20)

        modes = {f["properties"]["mode"] for f in features if "mode" in f.get("properties", {})}
        self.assertIn("train", modes)

        # Verify geometry
        for f in features[:10]:
            self.assertEqual(f["geometry"]["type"], "LineString")
            self.assertGreaterEqual(len(f["geometry"]["coordinates"]), 2)

    def test_generate_static_transit_bundle(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_files = generate_static_transit_bundle(out_dir=tmpdir)

            self.assertIn("routes_file", out_files)
            self.assertIn("route_stops_file", out_files)
            self.assertIn("route_shapes_file", out_files)

            for path in out_files.values():
                self.assertTrue(os.path.exists(path))
                self.assertGreater(os.path.getsize(path), 100)

            # Verify routes.json loadable
            with open(out_files["routes_file"], "r", encoding="utf-8") as f:
                data = json.load(f)
                self.assertIn("train", data)


if __name__ == "__main__":
    unittest.main()
