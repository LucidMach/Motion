import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from directional_routing.directional_routing import calculate_bearing, haversine
from server.services.geometry_utils import project_point_to_polyline, point_at_arc_length

# An L-shaped polyline: due north for ~1.11km, then due east for ~0.89km.
BENT_POLYLINE = [(0.0, 0.0), (0.0, 0.01), (0.01, 0.01)]


class ProjectPointToPolylineTestCase(unittest.TestCase):
    def test_returns_none_for_polyline_shorter_than_two_points(self):
        self.assertIsNone(project_point_to_polyline((0.0, 0.0), [(0.0, 0.0)]))
        self.assertIsNone(project_point_to_polyline((0.0, 0.0), []))

    def test_snaps_to_the_corner_for_a_point_near_the_bend(self):
        result = project_point_to_polyline((0.0002, 0.0102), BENT_POLYLINE)
        self.assertIsNotNone(result)
        snapped_lon, snapped_lat = result["point"]
        self.assertAlmostEqual(snapped_lon, 0.0, places=3)
        self.assertAlmostEqual(snapped_lat, 0.01, places=3)

    def test_arc_length_matches_sum_of_segment_haversines_up_to_the_snap_point(self):
        # A point exactly on the second segment, halfway along it.
        result = project_point_to_polyline((0.005, 0.01), BENT_POLYLINE)
        first_leg_km = haversine(0.0, 0.0, 0.01, 0.0)
        second_leg_km = haversine(0.01, 0.0, 0.01, 0.01)
        self.assertAlmostEqual(result["arc_length_km"], first_leg_km + second_leg_km / 2, places=3)

    def test_bearing_matches_the_winning_segments_direction(self):
        # A point on the first (northbound) segment.
        result = project_point_to_polyline((0.0, 0.005), BENT_POLYLINE)
        expected_bearing = calculate_bearing(0.0, 0.0, 0.01, 0.0)
        self.assertAlmostEqual(result["bearing_deg"], expected_bearing, places=3)

    def test_point_far_off_the_line_still_snaps_to_nearest_segment(self):
        result = project_point_to_polyline((100.0, 100.0), BENT_POLYLINE)
        self.assertIsNotNone(result)


class PointAtArcLengthTestCase(unittest.TestCase):
    def test_returns_none_for_polyline_shorter_than_two_points(self):
        self.assertIsNone(point_at_arc_length([(0.0, 0.0)], 1.0))

    def test_zero_distance_returns_the_start_point(self):
        result = point_at_arc_length(BENT_POLYLINE, 0.0)
        self.assertAlmostEqual(result["point"][0], 0.0, places=6)
        self.assertAlmostEqual(result["point"][1], 0.0, places=6)

    def test_midpoint_of_total_length_lands_on_the_expected_segment(self):
        first_leg_km = haversine(0.0, 0.0, 0.01, 0.0)
        second_leg_km = haversine(0.01, 0.0, 0.01, 0.01)
        total_km = first_leg_km + second_leg_km
        result = point_at_arc_length(BENT_POLYLINE, total_km / 2)
        # Halfway along the total length falls on the first (northbound) leg,
        # since that leg alone is longer than half the total.
        self.assertAlmostEqual(result["point"][0], 0.0, places=4)
        self.assertGreater(result["point"][1], 0.0)
        self.assertLess(result["point"][1], 0.01)

    def test_target_beyond_total_length_clamps_to_the_end_point(self):
        result = point_at_arc_length(BENT_POLYLINE, 999.0)
        self.assertAlmostEqual(result["point"][0], 0.01, places=6)
        self.assertAlmostEqual(result["point"][1], 0.01, places=6)

    def test_negative_target_clamps_to_the_start_point(self):
        result = point_at_arc_length(BENT_POLYLINE, -5.0)
        self.assertAlmostEqual(result["point"][0], 0.0, places=6)
        self.assertAlmostEqual(result["point"][1], 0.0, places=6)

    def test_round_trip_with_project_point_to_polyline(self):
        # Projecting a point then walking back to its arc-length should
        # reproduce (approximately) the same snapped point.
        projected = project_point_to_polyline((0.005, 0.0), BENT_POLYLINE)
        walked_back = point_at_arc_length(BENT_POLYLINE, projected["arc_length_km"])
        self.assertAlmostEqual(walked_back["point"][0], projected["point"][0], places=4)
        self.assertAlmostEqual(walked_back["point"][1], projected["point"][1], places=4)


if __name__ == "__main__":
    unittest.main()
