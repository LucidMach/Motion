import os
import sqlite3
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import geocoding
from geocoding.adapter import FakeGeocodingAdapter


class TestGeocodingSearch(unittest.TestCase):
    def test_search_prefers_gtfs_then_landmark_then_nominatim(self):
        import tempfile
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            conn = sqlite3.connect(path)
            c = conn.cursor()
            c.execute("CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL)")
            c.execute("INSERT INTO stops VALUES ('1', 'Richmond Station', -37.8242, 144.9895)")
            conn.commit()
            conn.close()

            fake = FakeGeocodingAdapter({
                "nowhere in particular": [
                    {"lat": "-37.5", "lon": "145.0", "category": "shop", "type": "supermarket",
                     "name": "Some Supermarket", "address": {"road": "Test Rd", "suburb": "Testville"},
                     "osm_type": "node", "osm_id": "123"}
                ]
            })

            # GTFS stop wins over everything - once the limit is met locally,
            # Nominatim is never consulted.
            results = geocoding.search("Richmond", limit=1, db_path=path, adapter=fake)
            self.assertTrue(any(r.stop_name == "Richmond Station" for r in results))
            self.assertEqual(fake.calls, [])

            # Curated landmark resolves without touching Nominatim.
            results = geocoding.search("unimelb", limit=1, db_path=path, adapter=fake)
            self.assertTrue(any("university of melbourne" in r.stop_name.lower() for r in results))
            self.assertEqual(fake.calls, [])

            # Anything else falls through to Nominatim - the source of truth.
            results = geocoding.search("nowhere in particular", limit=5, db_path=path, adapter=fake)
            self.assertTrue(any(r.stop_name == "Some Supermarket" for r in results))
            self.assertIn("nowhere in particular", fake.calls)
        finally:
            os.remove(path)

    def test_resolve_stop_coords_never_touches_nominatim(self):
        import tempfile
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        try:
            conn = sqlite3.connect(path)
            c = conn.cursor()
            c.execute("CREATE TABLE stops (stop_id TEXT PRIMARY KEY, stop_name TEXT, stop_lat REAL, stop_lon REAL)")
            c.execute("INSERT INTO stops VALUES ('S1', 'Richmond Station', -37.8242, 144.9895)")
            conn.commit()
            conn.close()

            coords = geocoding.resolve_stop_coords("S1", db_path=path)
            self.assertIsNotNone(coords)
            self.assertAlmostEqual(coords[0], -37.8242, places=3)

            self.assertIsNone(geocoding.resolve_stop_coords("UNKNOWN", db_path=path))
        finally:
            os.remove(path)

    def test_geocode_address_landmark_fast_path(self):
        fake = FakeGeocodingAdapter({})
        coords = geocoding.geocode_address("Alan Finkel Building", db_path=":memory:", adapter=fake)
        self.assertIsNotNone(coords)
        self.assertAlmostEqual(coords[0], -37.9126, places=3)
        self.assertEqual(fake.calls, [])

    def test_geocode_address_falls_back_to_nominatim(self):
        fake = FakeGeocodingAdapter({
            "somewhere unknown, victoria, australia": [
                {"lat": "-38.0", "lon": "145.5"}
            ]
        })
        coords = geocoding.geocode_address("Somewhere Unknown", db_path=":memory:", adapter=fake)
        self.assertEqual(coords, (-38.0, 145.5))
        self.assertTrue(len(fake.calls) > 0)


if __name__ == "__main__":
    unittest.main()
