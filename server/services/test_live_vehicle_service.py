import os
import sys
import time
import unittest
from unittest.mock import patch, MagicMock

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from google.transit import gtfs_realtime_pb2
from server.services.live_vehicle_service import (
    parse_vehicle_positions_feed,
    snap_vehicle_position,
    get_live_vehicles_data,
    get_live_vehicles_geojson,
    clear_vehicle_cache,
    LiveVehicleService,
)


class TestLiveVehicleService(unittest.TestCase):
    def setUp(self):
        clear_vehicle_cache()

    def tearDown(self):
        clear_vehicle_cache()

    def _build_mock_feed(self, vehicles):
        """Constructs a binary GTFS-R FeedMessage with VehiclePosition entities."""
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.header.gtfs_realtime_version = "2.0"
        feed.header.incrementality = 0
        feed.header.timestamp = int(time.time())

        for idx, v in enumerate(vehicles):
            entity = feed.entity.add()
            entity.id = f"veh_{idx}"
            vp = entity.vehicle
            vp.trip.trip_id = v.get("trip_id", f"trip_{idx}")
            vp.trip.route_id = v.get("route_id", "2-LIL")
            vp.position.latitude = v.get("lat", -37.8180)
            vp.position.longitude = v.get("lon", 144.9671)
            if "bearing" in v:
                vp.position.bearing = v["bearing"]
            if "speed" in v:
                vp.position.speed = v["speed"]
            if "status" in v:
                vp.current_status = v["status"]
            if "stop_sequence" in v:
                vp.current_stop_sequence = v["stop_sequence"]

        return feed.SerializeToString()

    def test_parse_vehicle_positions_feed(self):
        raw_pb = self._build_mock_feed([
            {
                "trip_id": "T_LIL_01",
                "route_id": "2-LIL",
                "lat": -37.8180,
                "lon": 144.9671,
                "bearing": 90.0,
                "speed": 15.0,
                "status": 1, # STOPPED_AT
                "stop_sequence": 3,
            }
        ])

        parsed = parse_vehicle_positions_feed(raw_pb, mode="train")
        self.assertEqual(len(parsed), 1)
        v = parsed[0]
        self.assertEqual(v["trip_id"], "T_LIL_01")
        self.assertEqual(v["route_id"], "2-LIL")
        self.assertAlmostEqual(v["lat"], -37.8180, places=4)
        self.assertAlmostEqual(v["lon"], 144.9671, places=4)
        self.assertEqual(v["bearing_deg"], 90.0)
        self.assertEqual(v["speed_kmh"], 54.0) # 15 m/s * 3.6
        self.assertEqual(v["mode"], "train")
        self.assertTrue(v["is_stopped"])

    def test_snap_vehicle_position(self):
        # Polyline running south to north along lon 144.0
        polyline = [
            [144.0, -37.85],
            [144.0, -37.80],
            [144.0, -37.75],
        ]
        # Raw point slightly east of track
        raw_lat = -37.82
        raw_lon = 144.005 # ~400m east

        snapped_lat, snapped_lon, bearing = snap_vehicle_position(raw_lat, raw_lon, polyline)

        # Snapped point should be on lon 144.0
        self.assertAlmostEqual(snapped_lon, 144.0, places=4)
        self.assertAlmostEqual(snapped_lat, -37.82, places=3)
        self.assertAlmostEqual(bearing, 0.0, places=1) # Bearing north

    def test_snap_vehicle_position_empty_polyline(self):
        # Should gracefully return raw coords if polyline is missing or invalid
        raw_lat = -37.82
        raw_lon = 144.005
        snapped_lat, snapped_lon, bearing = snap_vehicle_position(raw_lat, raw_lon, [])
        self.assertEqual(snapped_lat, raw_lat)
        self.assertEqual(snapped_lon, raw_lon)

    @patch("server.services.live_vehicle_service.fetch_raw_gtfsr_feed")
    def test_ttl_caching(self, mock_fetch):
        mock_pb = self._build_mock_feed([{"trip_id": "T1", "route_id": "2-LIL"}])
        mock_fetch.return_value = mock_pb

        service = LiveVehicleService(ttl_seconds=25)

        # Call 1
        data1 = service.get_vehicles(mode="train", api_key="test_key")
        self.assertEqual(len(data1), 1)
        self.assertEqual(mock_fetch.call_count, 1)

        # Call 2 immediately (within 25s)
        data2 = service.get_vehicles(mode="train", api_key="test_key")
        self.assertEqual(len(data2), 1)
        # mock_fetch should NOT be called again because of TTL cache
        self.assertEqual(mock_fetch.call_count, 1)

    @patch.dict(os.environ, {"PTV_API_KEY": "", "PTVOpenDataAPIKey": ""})
    def test_graceful_degradation_without_api_key(self):
        service = LiveVehicleService()
        geojson = service.get_vehicles_geojson(mode="all", api_key=None)

        self.assertEqual(geojson.get("type"), "FeatureCollection")
        self.assertEqual(len(geojson.get("features", [])), 0)
        self.assertEqual(geojson.get("telemetry", {}).get("ptv_feed"), "offline")
        self.assertIn("not configured", geojson.get("telemetry", {}).get("reason", "").lower())

    @patch("server.services.live_vehicle_service.fetch_raw_gtfsr_feed")
    def test_graceful_degradation_on_network_error(self, mock_fetch):
        mock_fetch.side_effect = Exception("Connection timed out")

        service = LiveVehicleService()
        geojson = service.get_vehicles_geojson(mode="all", api_key="some_key")

        self.assertEqual(geojson.get("type"), "FeatureCollection")
        self.assertEqual(len(geojson.get("features", [])), 0)
        self.assertEqual(geojson.get("telemetry", {}).get("ptv_feed"), "offline")


if __name__ == "__main__":
    unittest.main()
