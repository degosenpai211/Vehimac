from datetime import date
from unittest import TestCase, main

from app.services.salary import (
    PeriodConfig,
    as_start_date,
    pick_period,
    periods_since,
    recent_periods,
)

TODAY = date(2026, 9, 21)
MONTHLY = PeriodConfig(kind="monthly", pay_day=30)


class PickPeriodTests(TestCase):
    def test_monthly_uses_this_month_even_if_older_are_unpaid(self):
        periods = recent_periods(TODAY, MONTHLY)
        current = pick_period(periods, TODAY)
        self.assertEqual(current["key"], "m:2026-09")
        self.assertEqual(current["label"], "Septiembre 2026")

    def test_monthly_does_not_jump_back_to_march(self):
        periods = recent_periods(TODAY, MONTHLY)
        current = pick_period(periods, TODAY)
        self.assertNotEqual(current["key"], "m:2026-03")
        self.assertNotIn("Marzo", current["label"])

    def test_monthly_after_payday_still_this_month(self):
        today = date(2026, 9, 30)
        current = pick_period(recent_periods(today, MONTHLY), today)
        self.assertEqual(current["key"], "m:2026-09")

    def test_biweekly_uses_current_fortnight(self):
        current = pick_period(recent_periods(TODAY, PeriodConfig(kind="biweekly")), TODAY)
        self.assertEqual(current["key"], "q:2026-09-b")

    def test_weekly_uses_latest_started_week(self):
        current = pick_period(recent_periods(TODAY, PeriodConfig(kind="weekly", pay_day=4)), TODAY)
        self.assertTrue(current["key"].startswith("w:"))
        self.assertGreaterEqual(current["start"], date(2026, 9, 14))
        self.assertLessEqual(current["start"], TODAY)


class WorkStartCycleTests(TestCase):
    def test_monthly_from_start_day_until_month_completes(self):
        periods = recent_periods(
            TODAY,
            PeriodConfig(kind="monthly", started=date(2026, 9, 10)),
        )
        current = pick_period(periods, TODAY)
        self.assertEqual(current["start"], date(2026, 9, 10))
        self.assertEqual(current["end"], date(2026, 10, 9))
        self.assertEqual(current["payday"], date(2026, 10, 9))
        self.assertIn("10/09", current["label"])

    def test_weekly_from_start_day_until_week_completes(self):
        periods = recent_periods(
            TODAY,
            PeriodConfig(kind="weekly", started=date(2026, 9, 10)),
        )
        current = pick_period(periods, TODAY)
        self.assertEqual(current["start"], date(2026, 9, 17))
        self.assertEqual(current["end"], date(2026, 9, 23))

    def test_biweekly_from_start_day_until_fortnight_completes(self):
        periods = recent_periods(
            TODAY,
            PeriodConfig(kind="biweekly", started=date(2026, 9, 10)),
        )
        current = pick_period(periods, TODAY)
        self.assertEqual(current["start"], date(2026, 9, 10))
        self.assertEqual(current["end"], date(2026, 9, 23))

    def test_return_from_leave_starts_a_new_week(self):
        today = date(2026, 10, 8)
        periods = recent_periods(
            today,
            PeriodConfig(kind="weekly", started=date(2026, 10, 5)),
        )
        current = pick_period(periods, today)
        self.assertEqual(current["start"], date(2026, 10, 5))
        self.assertEqual(current["end"], date(2026, 10, 11))


class PeriodsSinceTests(TestCase):
    def test_drops_months_before_the_worker_started(self):
        periods = recent_periods(TODAY, MONTHLY)
        started = date(2026, 9, 1)
        visible = periods_since(periods, started)
        keys = [p["key"] for p in visible]
        self.assertEqual(keys, ["m:2026-09"])
        self.assertNotIn("m:2026-03", keys)

    def test_keeps_from_start_month(self):
        periods = recent_periods(TODAY, MONTHLY)
        visible = periods_since(periods, date(2026, 8, 15))
        keys = [p["key"] for p in visible]
        self.assertEqual(keys, ["m:2026-09", "m:2026-08"])

    def test_none_started_keeps_all(self):
        periods = recent_periods(TODAY, MONTHLY)
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
