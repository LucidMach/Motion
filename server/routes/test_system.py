import os
import sys
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi.testclient import TestClient
from server.main import app


class TestHealthEndpoint(unittest.TestCase):
    """
    Regression tests for /api/health honestly reflecting backend readiness.
    It used to always return 200/"ok" regardless of whether the KDTree or
    database had actually loaded, which let the frontend's HealthCheckGate
    declare "ONLINE" before the backend could actually serve a route.
    """

    @classmethod
    def setUpClass(cls):
        cls._client_ctx = TestClient(app)
        cls.client = cls._client_ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls._client_ctx.__exit__(None, None, None)

    def test_health_ok_when_kdtree_and_db_ready(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertFalse(data["cold_starting"])
        self.assertTrue(data["kdtree_in_memory"])
        self.assertTrue(data["db_loaded"])

    @patch("server.routes.system.get_spatial_tree_status")
    def test_health_returns_503_starting_when_kdtree_not_loaded(self, mock_tree_status):
        mock_tree_status.return_value = {"is_in_memory": False}
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 503)
        data = res.json()
        self.assertEqual(data["status"], "starting")
        self.assertTrue(data["cold_starting"])
        self.assertFalse(data["kdtree_in_memory"])

    @patch("server.routes.system.os.path.exists")
    def test_health_returns_503_degraded_when_db_missing(self, mock_exists):
        mock_exists.return_value = False
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 503)
        data = res.json()
        self.assertEqual(data["status"], "degraded")
        self.assertTrue(data["cold_starting"])
        self.assertFalse(data["db_loaded"])


if __name__ == "__main__":
    unittest.main()
