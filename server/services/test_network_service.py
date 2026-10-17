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
    def test_curated_metadata_colors(self):
        """Verify the 6 official PTV train line color groups."""
        # Dark Blue: Alamein, Belgrave, Glen Waverley, Lilydale
        self.assertEqual(_resolve_line_color("Alamein", "152C6B"), "#152C6B")
        self.assertEqual(_resolve_line_color("Belgrave", "152C6B"), "#152C6B")
        self.assertEqual(_resolve_line_color("Glen Waverley", "152C6B"), "#152C6B")
        self.assertEqual(_resolve_line_color("Lilydale", "152C6B"), "#152C6B")
        # Red: Hurstbridge, Mernda
        self.assertEqual(_resolve_line_color("Hurstbridge", "BE1014"), "#BE1014")
        self.assertEqual(_resolve_line_color("Mernda", "BE1014"), "#BE1014")
        # Yellow: Craigieburn, Upfield
        self.assertEqual(_resolve_line_color("Craigieburn", "FFBE00"), "#FFBE00")
        self.assertEqual(_resolve_line_color("Upfield", "FFBE00"), "#FFBE00")
        # Green: Frankston, Stony Point
        self.assertEqual(_resolve_line_color("Frankston", "028430"), "#028430")
        self.assertEqual(_resolve_line_color("Stony Point", "028430"), "#028430")
        # Pink: Sandringham, Werribee, Williamstown
        self.assertEqual(_resolve_line_color("Sandringham", "F178AF"), "#F178AF")
        self.assertEqual(_resolve_line_color("Werribee", "F178AF"), "#F178AF")
        self.assertEqual(_resolve_line_color("Williamstown", "F178AF"), "#F178AF")
        # Metro Tunnel (City Loop Blue): Cranbourne, Pakenham, Sunbury
        self.assertEqual(_resolve_line_color("Cranbourne", "34ACE1"), "#0072CE")
        self.assertEqual(_resolve_line_color("Pakenham", "34ACE1"), "#0072CE")
        self.assertEqual(_resolve_line_color("Sunbury", "34ACE1"), "#0072CE")

    def test_uncurated_line_falls_back_to_gtfs_color(self):
        self.assertEqual(_resolve_line_color("SomeUnlistedLine", "AABBCC"), "#AABBCC")

    def test_uncurated_line_with_no_gtfs_color_falls_back_to_default(self):
        self.assertEqual(_resolve_line_color("SomeUnlistedLine", ""), "#0072CE")

    def test_city_loop_lines_color_and_group(self):
        from server.services.network_service import LINE_METADATA
        self.assertEqual(LINE_METADATA["Cranbourne"]["color"], "#0072CE")
        self.assertEqual(LINE_METADATA["Pakenham"]["color"], "#0072CE")
        self.assertEqual(LINE_METADATA["Sunbury"]["color"], "#0072CE")
        self.assertEqual(LINE_METADATA["City Circle"]["color"], "#0072CE")
        self.assertEqual(LINE_METADATA["Cranbourne"]["group"], "City Loop Group")
        self.assertEqual(LINE_METADATA["Pakenham"]["group"], "City Loop Group")
        self.assertEqual(LINE_METADATA["Sunbury"]["group"], "City Loop Group")

    def test_lines_with_no_trains_excluded_from_routes_metadata(self):
        from server.services.network_service import get_all_routes_metadata
        routes = get_all_routes_metadata()
        names = {r["route_short_name"] for r in routes}
        self.assertNotIn("Flemington Racecourse", names)
        self.assertNotIn("City Circle", names)
        self.assertNotIn("Replacement Bus", names)
        self.assertNotIn("Williamstown", names)
        self.assertNotIn("Stony Point", names)
        self.assertIn("Pakenham", names)
        self.assertIn("Cranbourne", names)
        self.assertIn("Sandringham", names)

    def test_routes_metadata_sorted_by_corridor_order(self):
        from server.services.network_service import get_all_routes_metadata
        routes = get_all_routes_metadata()
        names = [r["route_short_name"] for r in routes]
        # Metro Tunnel group precedes Burnley group
        self.assertLess(names.index("Pakenham"), names.index("Lilydale"))
        self.assertLess(names.index("Cranbourne"), names.index("Lilydale"))
        # Burnley group precedes Northern group
        self.assertLess(names.index("Lilydale"), names.index("Craigieburn"))
        # Northern group precedes Clifton Hill group
        self.assertLess(names.index("Craigieburn"), names.index("Mernda"))
        # Clifton Hill group precedes Frankston line
        self.assertLess(names.index("Mernda"), names.index("Frankston"))
        # Frankston line precedes Cross-City group (Werribee, Sandringham)
        self.assertLess(names.index("Frankston"), names.index("Werribee"))
        self.assertLess(names.index("Werribee"), names.index("Sandringham"))
        # Sandringham is at the end
        self.assertEqual(names[-1], "Sandringham")

    def test_cross_city_and_frankston_groups(self):
        from server.services.network_service import LINE_METADATA
        self.assertEqual(LINE_METADATA["Sandringham"]["group"], "Cross-City Group")
        self.assertEqual(LINE_METADATA["Werribee"]["group"], "Cross-City Group")
        self.assertEqual(LINE_METADATA["Williamstown"]["group"], "Cross-City Group")
        self.assertEqual(LINE_METADATA["Frankston"]["group"], "Frankston Line")
        self.assertEqual(LINE_METADATA["Stony Point"]["group"], "Frankston Line")
        self.assertTrue(LINE_METADATA["Stony Point"].get("outline"))
        self.assertTrue(LINE_METADATA["Stony Point"].get("shuttle"))


class TestTramRouteColors(unittest.TestCase):
    def test_get_tram_routes_metadata_fetches_official_colors(self):
        from server.services.network_service import get_tram_routes_metadata
        trams = get_tram_routes_metadata()
        self.assertIn("96", trams)
        self.assertEqual(trams["96"]["color"], "#C6007E")
        self.assertEqual(trams["109"]["color"], "#E87722")
        self.assertEqual(trams["1"]["color"], "#B5BD00")
        self.assertEqual(trams["35"]["color"], "#6B3529")

    def test_get_tram_route_color_resolves_exact_and_embedded_names(self):
        from server.services.network_service import get_tram_route_color
        self.assertEqual(get_tram_route_color("96"), "#C6007E")
        self.assertEqual(get_tram_route_color("Tram 96"), "#C6007E")
        self.assertEqual(get_tram_route_color("Route 109 - Box Hill"), "#E87722")
        self.assertEqual(get_tram_route_color("NonExistentRoute"), "#78BE20")


if __name__ == "__main__":
    unittest.main()
