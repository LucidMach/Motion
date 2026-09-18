import os
import sys
import unittest
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import ptv_realtime


class TestPtvRealtime(unittest.TestCase):

    def test_parse_arrival_datetime(self):
        # 1. Datetime object passthrough
        dt_obj = datetime(2026, 8, 20, 9, 15, 0)
        self.assertEqual(ptv_realtime.parse_arrival_datetime(dt_obj), dt_obj)

        # 2. ISO timestamp strings
        dt_str = "2026-08-20 09:15"
        res_dt = ptv_realtime.parse_arrival_datetime(dt_str)
        self.assertEqual(res_dt.year, 2026)
        self.assertEqual(res_dt.month, 8)
        self.assertEqual(res_dt.day, 20)
        self.assertEqual(res_dt.hour, 9)
        self.assertEqual(res_dt.minute, 15)

        # 3. Unix epoch timestamp
        epoch = int(dt_obj.timestamp())
        res_epoch = ptv_realtime.parse_arrival_datetime(epoch)
        self.assertEqual(res_epoch.year, 2026)
        self.assertEqual(res_epoch.hour, 9)
        self.assertEqual(res_epoch.minute, 15)

        # 4. HH:MM string
        res_hm = ptv_realtime.parse_arrival_datetime("14:30")
        self.assertEqual(res_hm.hour, 14)
        self.assertEqual(res_hm.minute, 30)

    def test_is_alert_active_at_time(self):
        target_arrival_dt = datetime(2026, 8, 20, 10, 0, 0)
        target_ts = int(target_arrival_dt.timestamp())  # 10:00 AM

        # Case 1: Alert active during the window (08:00 AM to 12:00 PM)
        periods_active = [{"start": target_ts - 7200, "end": target_ts + 7200}]
        self.assertTrue(ptv_realtime.is_alert_active_at_time(periods_active, target_arrival_dt))

        # Case 2: Future alert starting at 11:00 AM (after arrival at 10:00 AM)
        periods_future = [{"start": target_ts + 3600, "end": target_ts + 7200}]
        self.assertFalse(ptv_realtime.is_alert_active_at_time(periods_future, target_arrival_dt))

        # Case 3: Past alert ended at 07:00 AM (more than 120 mins before arrival)
        periods_past = [{"start": target_ts - 14400, "end": target_ts - 7500}]
        self.assertFalse(ptv_realtime.is_alert_active_at_time(periods_past, target_arrival_dt))

        # Case 4: Unconstrained / Ongoing alert (no end date)
        periods_ongoing = [{"start": target_ts - 3600, "end": 0}]
        self.assertTrue(ptv_realtime.is_alert_active_at_time(periods_ongoing, target_arrival_dt))

        # Case 5: Empty active periods (default to active)
        self.assertTrue(ptv_realtime.is_alert_active_at_time([], target_arrival_dt))


class TestMelbourneTimezoneHandling(unittest.TestCase):
    """
    Regression tests for the Render-UTC-vs-Melbourne-local bug: the backend
    used naive datetime.now() as if it were Melbourne wall-clock time, which
    is only correct if the host machine's local timezone happens to already
    be Melbourne (true on this dev machine, false on Render's UTC
    containers). These tests use fixed reference dates instead of relying on
    the test runner's system timezone, so they'd fail in CI regardless of
    which timezone the runner is in.
    """

    def test_melbourne_naive_to_epoch_handles_dst_offsets_correctly(self):
        # AEDT (UTC+11) - daylight saving, mid-January
        aedt_local = datetime(2026, 1, 15, 14, 30, 0)
        expected_epoch = int(datetime(2026, 1, 15, 3, 30, 0, tzinfo=ZoneInfo("UTC")).timestamp())
        self.assertEqual(ptv_realtime.ptv_realtime.melbourne_naive_to_epoch(aedt_local), expected_epoch)

        # AEST (UTC+10) - standard time, mid-June
        aest_local = datetime(2026, 6, 15, 14, 30, 0)
        expected_epoch_aest = int(datetime(2026, 6, 15, 4, 30, 0, tzinfo=ZoneInfo("UTC")).timestamp())
        self.assertEqual(ptv_realtime.ptv_realtime.melbourne_naive_to_epoch(aest_local), expected_epoch_aest)

    def test_melbourne_fromtimestamp_is_inverse_of_naive_to_epoch(self):
        local_dt = datetime(2026, 1, 15, 14, 30, 0)
        epoch = ptv_realtime.ptv_realtime.melbourne_naive_to_epoch(local_dt)
        self.assertEqual(ptv_realtime.ptv_realtime.melbourne_fromtimestamp(epoch), local_dt)

    @patch('ptv_realtime.ptv_realtime.melbourne_now')
    def test_parse_arrival_datetime_hhmm_rolls_over_based_on_melbourne_now(self, mock_now):
        # Regression test: parsing a bare "HH:MM" string (what the frontend
        # sends) must decide "today or tomorrow" using Melbourne's current
        # time, not whatever timezone the host machine's clock is in - the
        # old code used datetime.now() here, which on Render (UTC) is
        # 10-11 hours off from Melbourne.
        mock_now.return_value = datetime(2026, 3, 10, 23, 0, 0)  # 11pm Melbourne
        result = ptv_realtime.parse_arrival_datetime("06:00")  # earlier than 23:00 -> rolls to tomorrow
        self.assertEqual(result, datetime(2026, 3, 11, 6, 0, 0))

        mock_now.return_value = datetime(2026, 3, 10, 4, 0, 0)  # 4am Melbourne
        result2 = ptv_realtime.parse_arrival_datetime("06:00")  # later than 04:00 -> stays today
        self.assertEqual(result2, datetime(2026, 3, 10, 6, 0, 0))


if __name__ == '__main__':
    unittest.main()
