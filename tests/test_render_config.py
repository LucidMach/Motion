import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import yaml


class TestRenderConfig(unittest.TestCase):
    """
    Sanity checks on render.yaml so accidental drift (e.g. someone bumping
    the service off the free plan, or breaking the start command) gets
    caught by the test suite instead of surfacing as a surprise Render bill
    or a broken deploy.
    """

    @classmethod
    def setUpClass(cls):
        config_path = os.path.join(PROJECT_ROOT, "render.yaml")
        with open(config_path) as f:
            cls.config = yaml.safe_load(f)
        cls.service = cls.config["services"][0]

    def test_service_is_on_free_plan(self):
        self.assertEqual(self.service["plan"], "free")

    def test_start_command_runs_uvicorn_on_the_expected_app(self):
        self.assertIn("uvicorn server.main:app", self.service["startCommand"])
        self.assertIn("--host 0.0.0.0", self.service["startCommand"])
        self.assertIn("--port $PORT", self.service["startCommand"])

    def test_health_check_path_points_at_the_real_health_endpoint(self):
        self.assertEqual(self.service.get("healthCheckPath"), "/api/health")

    def test_required_env_vars_are_declared(self):
        declared_keys = {v["key"] for v in self.service.get("envVars", [])}
        for required in ("PTVOpenDataAPIKey", "GTFS_DB_URL", "PUBLIC_MAPBOX_TOKEN"):
            self.assertIn(required, declared_keys)


if __name__ == "__main__":
    unittest.main()
