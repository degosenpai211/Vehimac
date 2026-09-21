from datetime import date
from unittest import TestCase, main

from app.services.salary import (
    as_start_date,
    pick_period,
    periods_since,
    recent_periods,
)

TODAY = date(2026, 9, 21)


class PickPeriodTests(TestCase):
    def test_monthly_uses_this_month_even_if_older_are_unpaid(self):
        periods = recent_periods(TODAY, "monthly", 30)
        current = pick_period(periods, TODAY)
        self.assertEqual(current["key"], "m:2026-09")
        self.assertEqual(current["label"], "Septiembre 2026")

    def test_monthly_does_not_jump_back_to_march(self):
        periods = recent_periods(TODAY, "monthly", 30)
        current = pick_period(periods, TODAY)
        self.assertNotEqual(current["key"], "m:2026-03")
        self.assertNotIn("Marzo", current["label"])

    def test_monthly_after_payday_still_this_month(self):
        today = date(2026, 9, 30)
        current = pick_period(recent_periods(today, "monthly", 30), today)
        self.assertEqual(current["key"], "m:2026-09")

    def test_biweekly_uses_current_fortnight(self):
        current = pick_period(recent_periods(TODAY, "biweekly", None), TODAY)
        self.assertEqual(current["key"], "q:2026-09-b")

    def test_weekly_uses_latest_started_week(self):
        current = pick_period(recent_periods(TODAY, "weekly", 4), TODAY)
        self.assertTrue(current["key"].startswith("w:"))
        self.assertGreaterEqual(current["start"], date(2026, 9, 14))
        self.assertLessEqual(current["start"], TODAY)


class PeriodsSinceTests(TestCase):
    def test_drops_months_before_the_worker_started(self):
        periods = recent_periods(TODAY, "monthly", 30)
        started = date(2026, 9, 1)
        visible = periods_since(periods, started)
        keys = [p["key"] for p in visible]
        self.assertEqual(keys, ["m:2026-09"])
        self.assertNotIn("m:2026-03", keys)

    def test_keeps_from_start_month(self):
        periods = recent_periods(TODAY, "monthly", 30)
        visible = periods_since(periods, date(2026, 8, 15))
        keys = [p["key"] for p in visible]
        self.assertEqual(keys, ["m:2026-09", "m:2026-08"])

    def test_none_started_keeps_all(self):
        periods = recent_periods(TODAY, "monthly", 30)
        self.assertEqual(periods_since(periods, None), periods)


class AsStartDateTests(TestCase):
    def test_parses_iso_datetime(self):
        self.assertEqual(as_start_date("2026-03-10T12:00:00+00:00"), date(2026, 3, 10))

    def test_empty_is_none(self):
        self.assertIsNone(as_start_date(None))
        self.assertIsNone(as_start_date(""))

    def test_invalid_is_none(self):
        self.assertIsNone(as_start_date("no-es-fecha"))


if __name__ == "__main__":
    main()
