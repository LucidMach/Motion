import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server.services.disruption_reconciliation import reconcile_with_live_disruptions


def make_itinerary(legs):
    return {"status": "Success", "legs": legs, "total_travel_time_mins": 30}


TRANSIT_LEG = {"type": "TRANSIT", "trip_id": "T1", "is_replacement": False}
WALK_LEG = {"type": "WALK"}
REPLACEMENT_LEG = {"type": "TRANSIT", "trip_id": "T2", "is_replacement": True}
SCHEDULED_LEG = {"type": "TRANSIT", "trip_id": "SCHEDULED", "is_replacement": False}


class TestReconcileWithLiveDisruptions(unittest.TestCase):
    def test_no_cancellation_passes_through_unchanged(self):
        itinerary = make_itinerary([TRANSIT_LEG, WALK_LEG])
        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=lambda ids: self.fail("recompute should not be called"),
            realtime_checker=lambda trip_id: (0, False),
        )
        self.assertIs(result.itinerary, itinerary)
        self.assertFalse(result.recompute_attempted)
        self.assertTrue(result.recompute_succeeded)
        self.assertEqual(result.cancelled_trip_ids, [])
        self.assertEqual(result.realtime_delay_mins, 0)

    def test_accumulates_delay_across_legs(self):
        itinerary = make_itinerary([{"type": "TRANSIT", "trip_id": "A", "is_replacement": False},
                                     {"type": "TRANSIT", "trip_id": "B", "is_replacement": False}])
        delays = {"A": (5, False), "B": (3, False)}
        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=lambda ids: self.fail("recompute should not be called"),
            realtime_checker=lambda trip_id: delays[trip_id],
        )
        self.assertEqual(result.realtime_delay_mins, 8)
        self.assertFalse(result.recompute_attempted)

    def test_ignores_replacement_and_scheduled_legs(self):
        itinerary = make_itinerary([REPLACEMENT_LEG, SCHEDULED_LEG, WALK_LEG])
        calls = []
        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=lambda ids: self.fail("recompute should not be called"),
            realtime_checker=lambda trip_id: calls.append(trip_id) or (0, True),
        )
        self.assertEqual(calls, [])
        self.assertFalse(result.recompute_attempted)

    def test_cancellation_triggers_successful_recompute(self):
        itinerary = make_itinerary([TRANSIT_LEG])
        new_itinerary = make_itinerary([{"type": "TRANSIT", "trip_id": "T3", "is_replacement": False}])
        received_ids = []

        def recompute_fn(cancelled_ids):
            received_ids.extend(cancelled_ids)
            return new_itinerary

        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=recompute_fn,
            realtime_checker=lambda trip_id: (0, True),
        )
        self.assertEqual(received_ids, ["T1"])
        self.assertIs(result.itinerary, new_itinerary)
        self.assertTrue(result.recompute_attempted)
        self.assertTrue(result.recompute_succeeded)
        self.assertEqual(result.cancelled_trip_ids, ["T1"])

    def test_recompute_raising_is_reported_as_failure_not_swallowed(self):
        itinerary = make_itinerary([TRANSIT_LEG])

        def recompute_fn(cancelled_ids):
            raise RuntimeError("boom")

        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=recompute_fn,
            realtime_checker=lambda trip_id: (0, True),
        )
        self.assertIs(result.itinerary, itinerary)
        self.assertTrue(result.recompute_attempted)
        self.assertFalse(result.recompute_succeeded)
        self.assertEqual(result.cancelled_trip_ids, ["T1"])

    def test_recompute_returning_non_success_is_reported_as_failure(self):
        """This is the second, previously-unhandled failure mode: the routing
        algorithm can return {"status": "Error", ...} without raising (e.g. no
        path exists once the cancelled trip is excluded)."""
        itinerary = make_itinerary([TRANSIT_LEG])

        def recompute_fn(cancelled_ids):
            return {"status": "Error", "message": "No direct transit routes found."}

        result = reconcile_with_live_disruptions(
            itinerary=itinerary,
            recompute_fn=recompute_fn,
            realtime_checker=lambda trip_id: (0, True),
        )
        self.assertIs(result.itinerary, itinerary)
        self.assertTrue(result.recompute_attempted)
        self.assertFalse(result.recompute_succeeded)


if __name__ == "__main__":
    unittest.main()
