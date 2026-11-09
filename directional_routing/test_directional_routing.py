import unittest
import os
import sys

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

    def test_haversine_and_walking_time(self):
        # ~111 km between 1 degree of latitude
        dist = directional_routing.haversine(0.0, 0.0, 1.0, 0.0)
        self.assertGreater(dist, 110)
        self.assertLess(dist, 112)

        # 5 km at 5 km/h walking speed should take 60 minutes
        w_time = directional_routing.walking_time_mins(5.0)
        self.assertAlmostEqual(w_time, 60.0, delta=0.1)


if __name__ == '__main__':
    unittest.main()
