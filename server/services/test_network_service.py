import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.services.network_service import clean_station_name, is_city_loop_station, _resolve_line_color


class TestStationNameMatching(unittest.TestCase):
    def test_clean_station_name_strips_both_suffix_variants(self):
        self.assertEqual(clean_station_name("Flagstaff Railway Station"), "Flagstaff")
        self.assertEqual(clean_station_name("Flagstaff Station"), "Flagstaff")
        self.assertEqual(clean_station_name("South Yarra"), "South Yarra")

    def test_city_loop_interchange_matches_regardless_of_which_gtfs_row_wins_dedup(self):
        """Regression test: generate_metro_geojson dedups stops by name, keeping
        whichever GTFS row appears first - which for some stations is the
        "Station" variant, not "Railway Station". is_city_loop_station must
        match on the already-cleaned name so both variants count as an
        interchange, not just the exact "X Railway Station" string."""
        for raw_name in ("Flagstaff Railway Station", "Flagstaff Station"):
            with self.subTest(raw_name=raw_name):
                self.assertTrue(is_city_loop_station(clean_station_name(raw_name)))

    def test_non_interchange_station_is_not_flagged(self):
        self.assertFalse(is_city_loop_station(clean_station_name("Box Hill Station")))
        self.assertFalse(is_city_loop_station(clean_station_name("Ringwood Railway Station")))

    def test_all_ten_city_loop_stations_recognized(self):
        expected = {
            "Flinders Street", "Southern Cross", "Melbourne Central", "Parliament",
            "Flagstaff", "Richmond", "South Yarra", "North Melbourne", "Footscray", "Caulfield",
        }
        for name in expected:
            with self.subTest(name=name):
                self.assertTrue(is_city_loop_station(name))


class TestLineColorPrecedence(unittest.TestCase):
    def test_curated_metadata_overrides_wrong_gtfs_color(self):
        """Regression test: the GTFS zip's route_color for Werribee is F178AF
        (pink, wrongly duplicating Sandringham's color) - LINE_METADATA's
        curated #028430 green must win."""
        self.assertEqual(_resolve_line_color("Werribee", "F178AF"), "#028430")

    def test_uncurated_line_falls_back_to_gtfs_color(self):
        self.assertEqual(_resolve_line_color("SomeUnlistedLine", "AABBCC"), "#AABBCC")

    def test_uncurated_line_with_no_gtfs_color_falls_back_to_default(self):
        self.assertEqual(_resolve_line_color("SomeUnlistedLine", ""), "#0072CE")


if __name__ == "__main__":
    unittest.main()
