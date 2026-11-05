import json
import os
import shutil
import sys
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.services.route_shape_service import get_routes_for_mode, get_route_shape, get_route_stops

MODES = ["train", "tram", "bus"]
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "UI", "public", "data", "transit", "routes")


def run_precomputation() -> None:
    print("=" * 60)
    print("PRECOMPUTING PER-ROUTE SHAPE & STOP FILES")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)

    t0 = time.perf_counter()
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)

    total_routes = 0
    for mode in MODES:
        routes = get_routes_for_mode(mode)
        print(f"\n{mode}: {len(routes)} routes")
        for route in routes:
            route_short_name = route["route_short_name"]
            route_dir = os.path.join(OUTPUT_DIR, mode, route_short_name)
            os.makedirs(route_dir, exist_ok=True)

            shape = get_route_shape(mode, route_short_name)
            with open(os.path.join(route_dir, "shape.json"), "w") as f:
                json.dump(shape, f)

            stops = get_route_stops(mode, route_short_name)
            with open(os.path.join(route_dir, "stops.json"), "w") as f:
                json.dump(stops, f)

            total_routes += 1

    print(f"\n✓ Wrote shape.json + stops.json for {total_routes} routes in {time.perf_counter() - t0:.2f}s")


if __name__ == "__main__":
    run_precomputation()
