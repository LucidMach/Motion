import os
import sys
import unittest
from datetime import datetime

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


if __name__ == '__main__':
    unittest.main()
