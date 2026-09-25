from datetime import date
from unittest import TestCase, main

from app.services.salary import (
    AdvanceRequest,
    PeriodConfig,
    advances_in,
    advance_fits,
    as_start_date,
    clip_span,
    DateSpan,
    description_is_advance,
    leftover_base,
    pick_period,
    periods_since,
    recent_periods,
    week_saturday,
    week_monday,
)

TODAY = date(2026, 9, 21)
MONTHLY = PeriodConfig(kind="monthly")
WEEKLY = PeriodConfig(kind="weekly")
BIWEEKLY = PeriodConfig(kind="biweekly")


class PickPeriodTests(TestCase):
    def test_monthly_uses_this_month_even_if_older_are_unpaid(self):
        current = pick_period(recent_periods(TODAY, MONTHLY), TODAY)
        self.assertEqual(current["key"], "m:2026-09")
        self.assertEqual(current["label"], "Septiembre 2026")
        self.assertEqual(current["start"], date(2026, 9, 1))
        self.assertEqual(current["end"], date(2026, 9, 30))
        self.assertEqual(current["payday"], date(2026, 9, 30))

    def test_monthly_does_not_jump_back_to_march(self):
        current = pick_period(recent_periods(TODAY, MONTHLY), TODAY)
        self.assertNotEqual(current["key"], "m:2026-03")
        self.assertNotIn("Marzo", current["label"])

    def test_monthly_after_payday_still_this_month(self):
        today = date(2026, 9, 30)
        current = pick_period(recent_periods(today, MONTHLY), today)
        self.assertEqual(current["key"], "m:2026-09")
        self.assertEqual(current["payday"], date(2026, 9, 30))

    def test_weekly_is_monday_to_saturday(self):
        current = pick_period(recent_periods(TODAY, WEEKLY), TODAY)
        self.assertEqual(current["start"], date(2026, 9, 21))
        self.assertEqual(current["end"], date(2026, 9, 26))
        self.assertEqual(current["payday"], date(2026, 9, 26))
        self.assertEqual(current["start"].weekday(), 0)
        self.assertEqual(current["end"].weekday(), 5)
        self.assertNotEqual(current["end"].weekday(), 0)

    def test_sunday_keeps_the_week_that_ended_saturday(self):
        sunday = date(2026, 9, 27)
        current = pick_period(recent_periods(sunday, WEEKLY), sunday)
        self.assertEqual(current["start"], date(2026, 9, 21))
        self.assertEqual(current["end"], date(2026, 9, 26))

    def test_biweekly_is_two_monday_to_saturday_weeks(self):
        current = pick_period(recent_periods(TODAY, BIWEEKLY), TODAY)
        self.assertEqual(current["start"], date(2026, 9, 14))
        self.assertEqual(current["end"], date(2026, 9, 26))
        self.assertEqual(current["payday"], date(2026, 9, 26))
        self.assertEqual(current["end"].weekday(), 5)
        self.assertEqual(current["key"], "q:2026-09-14")


class WorkStartCycleTests(TestCase):
    def test_monthly_starts_mid_month_and_pays_last_day(self):
        current = pick_period(
            recent_periods(TODAY, PeriodConfig(kind="monthly", started=date(2026, 9, 10))),
            TODAY,
        )
        self.assertEqual(current["start"], date(2026, 9, 10))
        self.assertEqual(current["end"], date(2026, 9, 30))
        self.assertEqual(current["payday"], date(2026, 9, 30))
        self.assertIn("desde 10/09", current["label"])

    def test_weekly_midweek_start_still_ends_saturday(self):
        thursday = date(2026, 9, 10)
        current = pick_period(
            recent_periods(thursday, PeriodConfig(kind="weekly", started=thursday)),
            thursday,
        )
        self.assertEqual(current["start"], thursday)
        self.assertEqual(current["end"], date(2026, 9, 12))
        self.assertEqual(current["payday"], date(2026, 9, 12))

    def test_weekly_later_week_is_full_monday_saturday(self):
        current = pick_period(
            recent_periods(TODAY, PeriodConfig(kind="weekly", started=date(2026, 9, 10))),
            TODAY,
        )
        self.assertEqual(current["start"], date(2026, 9, 21))
        self.assertEqual(current["end"], date(2026, 9, 26))

    def test_biweekly_clips_first_fortnight_then_uses_two_weeks(self):
        current = pick_period(
            recent_periods(TODAY, PeriodConfig(kind="biweekly", started=date(2026, 9, 10))),
            TODAY,
        )
        self.assertEqual(current["start"], date(2026, 9, 14))
        self.assertEqual(current["end"], date(2026, 9, 26))

    def test_return_from_leave_week_is_monday_to_saturday(self):
        today = date(2026, 10, 8)
        current = pick_period(
            recent_periods(today, PeriodConfig(kind="weekly", started=date(2026, 10, 5))),
            today,
        )
        self.assertEqual(current["start"], date(2026, 10, 5))
        self.assertEqual(current["end"], date(2026, 10, 10))
        self.assertEqual(current["payday"], date(2026, 10, 10))


class ClipSpanTests(TestCase):
    def test_none_started_keeps_span(self):
        span = DateSpan(date(2026, 9, 21), date(2026, 9, 26))
        self.assertEqual(clip_span(span, None), span)

    def test_started_after_span_drops_it(self):
        span = DateSpan(date(2026, 9, 21), date(2026, 9, 26))
        self.assertIsNone(clip_span(span, date(2026, 9, 27)))

    def test_started_inside_span_clips_start(self):
        span = DateSpan(date(2026, 9, 21), date(2026, 9, 26))
        clipped = clip_span(span, date(2026, 9, 23))
        self.assertEqual(clipped.start, date(2026, 9, 23))
        self.assertEqual(clipped.end, date(2026, 9, 26))


class PeriodsSinceTests(TestCase):
    def test_drops_months_before_the_worker_started(self):
        periods = recent_periods(TODAY, MONTHLY)
        keys = [p["key"] for p in periods_since(periods, date(2026, 9, 1))]
        self.assertEqual(keys, ["m:2026-09"])
        self.assertNotIn("m:2026-03", keys)

    def test_keeps_from_start_month(self):
        periods = recent_periods(TODAY, MONTHLY)
        keys = [p["key"] for p in periods_since(periods, date(2026, 8, 15))]
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


class WeekHelperTests(TestCase):
    def test_saturday_is_five_days_after_monday(self):
        monday = week_monday(TODAY)
        self.assertEqual(monday, date(2026, 9, 21))
        self.assertEqual(week_saturday(monday), date(2026, 9, 26))


class AdvanceTests(TestCase):
    def test_leftover_subtracts_what_was_already_paid(self):
        self.assertEqual(leftover_base(1500, 500), 1000)

    def test_leftover_is_zero_when_the_period_is_covered(self):
        self.assertEqual(leftover_base(1500, 1500), 0)
        self.assertEqual(leftover_base(1500, 1600), 0)

    def test_advance_fits_when_amount_is_the_remaining_base(self):
        self.assertTrue(advance_fits(AdvanceRequest(1500, 500, 1000)))

    def test_advance_does_not_fit_over_the_remaining_base(self):
        self.assertFalse(advance_fits(AdvanceRequest(1500, 500, 1000.02)))

    def test_advance_rejects_zero_negative_or_no_salary(self):
        self.assertFalse(advance_fits(AdvanceRequest(1500, 0, 0)))
        self.assertFalse(advance_fits(AdvanceRequest(1500, 0, -10)))
        self.assertFalse(advance_fits(AdvanceRequest(0, 0, 100)))

    def test_description_marks_only_advance_rows(self):
        self.assertTrue(description_is_advance("Adelanto Juan"))
        self.assertFalse(description_is_advance("Salario Juan (base)"))
        self.assertFalse(description_is_advance(""))

    def test_advances_in_sums_only_advance_rows(self):
        pays = [
            {"description": "Adelanto Juan", "amount": 500},
            {"description": "Salario Juan (base)", "amount": 700},
        ]
        self.assertEqual(advances_in(pays), 500)


if __name__ == "__main__":
    main()
