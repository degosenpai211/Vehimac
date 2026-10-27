from unittest import TestCase

from app.services.tariff import clamp_efficiency, hourly_rate, merge_rates, pay_profile, print_quote, weekly_from_salary


class TariffTests(TestCase):
    def test_default_hour_matches_the_sheet(self):
        rates = merge_rates({})
        self.assertAlmostEqual(hourly_rate(rates), 21.032955, places=4)

    def test_sheet_efficiency_starts_at_seventy(self):
        self.assertEqual(merge_rates({})["efficiency"], 0.7)
        self.assertEqual(merge_rates({"efficiency": 0.65})["efficiency"], 0.65)

    def test_efficiency_stays_between_one_and_one_hundred(self):
        self.assertEqual(clamp_efficiency(0), 0.01)
        self.assertEqual(clamp_efficiency(2), 1)
        self.assertEqual(clamp_efficiency("no"), 0.6)
        self.assertEqual(clamp_efficiency(0.4), 0.4)

    def test_print_price_changes_with_the_hours(self):
        short = merge_rates({"print_hours": 5})
        middle = merge_rates({"print_hours": 12})
        long = merge_rates({"print_hours": 25})
        self.assertEqual(print_quote(short), 200)
        self.assertEqual(print_quote(middle), 420)
        self.assertEqual(print_quote(long), 750)

    def test_week_comes_from_the_finance_salary(self):
        self.assertEqual(weekly_from_salary({"salary_base": 850, "salary_period": "weekly"}), 850)
        self.assertEqual(weekly_from_salary({"salary_base": 1700, "salary_period": "biweekly"}), 850)
        self.assertEqual(weekly_from_salary({"salary_base": 2600, "salary_period": "monthly"}), round(2600 * 6 / 26, 2))

    def test_same_name_uses_the_finance_amount_and_the_worker_efficiency(self):
        profile = pay_profile("Ana", [
            {"name": "Ana", "role": "mechanic", "salary_base": 0, "labor_efficiency": 0.4},
            {"name": "Ana", "role": "admin", "salary_base": 850, "salary_period": "weekly", "labor_efficiency": 0.9},
        ])
        self.assertEqual(profile["weekly"], 850)
        self.assertEqual(profile["efficiency"], 0.4)

    def test_margin_cannot_reach_one(self):
        self.assertEqual(merge_rates({"margin": 1})["margin"], 0.95)
        self.assertEqual(merge_rates({"margin": -1})["margin"], 0)
