from datetime import date
from decimal import Decimal
from unittest import TestCase, main
from unittest.mock import patch

from app.schemas.work_order import OrderItemCreate
from app.services.work_order_rules import (
    PERIOD_ALL,
    PERIOD_DAY_AFTER,
    PERIOD_DUE_TODAY,
    PERIOD_NEXT_WEEK,
    PERIOD_OVERDUE,
    PERIOD_TODAY,
    PERIOD_TOMORROW,
    PERIOD_WEEK,
    as_order_date,
    matches_period,
    piece_as_summary,
    sanitize_search,
    summary_from_pieces,
)

TODAY = date(2026, 9, 16)


class FrozenDate(date):
    @classmethod
    def today(cls):
        return TODAY


def order_on(**fields):
    base = {
        "status": "en_proceso",
        "entry_date": None,
        "estimated_delivery_date": None,
    }
    base.update(fields)
    return base


class SanitizeSearchTests(TestCase):
    def test_normal_keeps_letters(self):
        self.assertEqual(sanitize_search("Perez"), "Perez")

    def test_strips_like_wildcards_and_commas(self):
        self.assertEqual(sanitize_search("  Ana, (OT%)_Luis  "), "Ana OT Luis")

    def test_only_noise_becomes_empty(self):
        self.assertEqual(sanitize_search(" %,_() "), "")

    def test_empty_stays_empty(self):
        self.assertEqual(sanitize_search(""), "")


class AsOrderDateTests(TestCase):
    def test_parses_iso_string(self):
        self.assertEqual(as_order_date("2026-09-16T12:00:00"), date(2026, 9, 16))

    def test_empty_string_is_none(self):
        self.assertIsNone(as_order_date(""))

    def test_none_stays_none(self):
        self.assertIsNone(as_order_date(None))

    def test_date_object_unchanged(self):
        self.assertEqual(as_order_date(TODAY), TODAY)


@patch("app.services.work_order_rules.date", FrozenDate)
class MatchesPeriodTests(TestCase):
    def test_none_and_all_include_everything(self):
        row = order_on(estimated_delivery_date="2020-01-01")
        self.assertTrue(matches_period(row, None))
        self.assertTrue(matches_period(row, PERIOD_ALL))

    def test_today_by_delivery(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-16"), PERIOD_TODAY))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-17"), PERIOD_TODAY))

    def test_today_spans_entry_and_delivery(self):
        row = order_on(entry_date="2026-09-10", estimated_delivery_date="2026-09-20")
        self.assertTrue(matches_period(row, PERIOD_TODAY))

    def test_today_by_entry_only(self):
        self.assertTrue(matches_period(order_on(entry_date="2026-09-16"), PERIOD_TODAY))

    def test_week_includes_delivery_in_range(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-14"), PERIOD_WEEK))
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-20"), PERIOD_WEEK))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-21"), PERIOD_WEEK))

    def test_overdue_skips_delivered(self):
        row = order_on(status="entregado", estimated_delivery_date="2026-09-01")
        self.assertFalse(matches_period(row, PERIOD_OVERDUE))

    def test_overdue_past_delivery(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-15"), PERIOD_OVERDUE))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-16"), PERIOD_OVERDUE))

    def test_agenda_due_today_tomorrow_and_day_after(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-16"), PERIOD_DUE_TODAY))
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-17"), PERIOD_TOMORROW))
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-18"), PERIOD_DAY_AFTER))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-16"), PERIOD_TOMORROW))

    def test_agenda_skips_delivered_or_missing_date(self):
        self.assertFalse(matches_period(order_on(status="entregado", estimated_delivery_date="2026-09-16"), PERIOD_DUE_TODAY))
        self.assertFalse(matches_period(order_on(), PERIOD_DUE_TODAY))

    def test_next_week(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-21"), PERIOD_NEXT_WEEK))
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2026-09-27"), PERIOD_NEXT_WEEK))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-20"), PERIOD_NEXT_WEEK))
        self.assertFalse(matches_period(order_on(estimated_delivery_date="2026-09-28"), PERIOD_NEXT_WEEK))

    def test_unknown_period_includes_row(self):
        self.assertTrue(matches_period(order_on(estimated_delivery_date="2020-01-01"), "no-existe"))


class PieceSummaryTests(TestCase):
    def test_dict_default_description(self):
        summary = piece_as_summary({"part_name": "Capo", "amount": 10})
        self.assertEqual(summary["work_description"], "Orden")
        self.assertEqual(summary["part_description"], "Capo")

    def test_model_and_total(self):
        pieces = [
            OrderItemCreate(part_name="A", description="Pintar", amount=Decimal("10")),
            OrderItemCreate(part_name="B", description="Soldar", amount=Decimal("2.5")),
        ]
        summary = summary_from_pieces(pieces)
        self.assertEqual(summary["work_description"], "Pintar")
        self.assertEqual(summary["price_charged"], 12.5)


if __name__ == "__main__":
    main()
