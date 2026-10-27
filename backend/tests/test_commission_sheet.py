from unittest import TestCase, main

from app.services.commission_sheet import (
    MAX_QUANTITY,
    NOTE_LIMIT,
    OTHER_PIECE_ID,
    commission_catalog,
    commission_figures,
    normalize_commission,
    task_pay,
)


class CommissionSheetTests(TestCase):
    def test_catalog_has_the_sheet_pieces(self):
        ids = [row["id"] for row in commission_catalog()]
        self.assertIn("torpedo", ids)
        self.assertIn("acc_internos", ids)
        self.assertEqual(len(ids), len(set(ids)))

    def test_known_piece_keeps_quantities_and_names(self):
        cleaned = normalize_commission({
            "piece_id": "torpedo",
            "weld_cm": 477,
            "finish_cm": "233.5",
            "mount_count": -1,
            "arm_count": 2,
            "mount_technician": "  Ana ",
            "arm_technician": "Pedro",
            "custom_amount": 80,
        })
        self.assertEqual(cleaned["piece_id"], "torpedo")
        self.assertEqual(cleaned["weld_cm"], 477)
        self.assertEqual(cleaned["finish_cm"], 233.5)
        self.assertEqual(cleaned["mount_count"], 0)
        self.assertEqual(cleaned["arm_count"], 2)
        self.assertEqual(cleaned["mount_technician"], "Ana")
        self.assertEqual(cleaned["custom_amount"], 0)

    def test_unknown_piece_is_empty(self):
        cleaned = normalize_commission({"piece_id": "no-existe", "weld_cm": 10})
        self.assertEqual(cleaned["piece_id"], "")
        self.assertEqual(cleaned["weld_cm"], 0)

    def test_other_piece_keeps_amount_and_note(self):
        cleaned = normalize_commission({
            "piece_id": OTHER_PIECE_ID,
            "weld_cm": 40,
            "custom_amount": 150.126,
            "custom_note": "  Soldó un soporte raro  ",
            "custom_technician": "Luis",
        })
        self.assertEqual(cleaned["piece_id"], OTHER_PIECE_ID)
        self.assertEqual(cleaned["weld_cm"], 0)
        self.assertEqual(cleaned["custom_amount"], 150.13)
        self.assertEqual(cleaned["custom_note"], "Soldó un soporte raro")
        self.assertEqual(cleaned["custom_technician"], "Luis")

    def test_other_note_is_cut(self):
        cleaned = normalize_commission({
            "piece_id": OTHER_PIECE_ID,
            "custom_note": "x" * (NOTE_LIMIT + 20),
        })
        self.assertEqual(len(cleaned["custom_note"]), NOTE_LIMIT)

    def test_quantity_does_not_pass_the_cap(self):
        cleaned = normalize_commission({"piece_id": "chapas", "weld_cm": MAX_QUANTITY + 50})
        self.assertEqual(cleaned["weld_cm"], MAX_QUANTITY)

    def test_blank_payload_stays_blank(self):
        self.assertEqual(normalize_commission(None)["piece_id"], "")
        self.assertEqual(normalize_commission("no")["piece_id"], "")

    def test_labor_matches_the_sheet_minutes(self):
        weld = task_pay("acc_internos", {"task": "weld", "quantity": 30})
        finish = task_pay("acc_internos", {"task": "finish", "quantity": 30})
        self.assertEqual(weld, 76.62)
        self.assertEqual(finish, 178.78)
        self.assertEqual(round(weld + finish, 2), 255.4)

    def test_mount_money_pays_the_standard_once(self):
        figures = commission_figures({
            "piece_id": "acc_internos",
            "mount_count": 100,
            "mount_technician": "Bruno",
        }, {"people": [{"name": "Bruno", "labor_efficiency": 0.6, "salary_base": 850, "salary_period": "weekly"}]})
        self.assertEqual(figures["pay"]["mount"], 17.03)
        self.assertEqual(figures["quote"]["mount"], 100)
        self.assertEqual(figures["pay"]["total"], 17)

    def test_lower_efficiency_increases_the_pay(self):
        slow = task_pay("acc_internos", {"task": "weld", "quantity": 30, "efficiency": 0.4})
        normal = task_pay("acc_internos", {"task": "weld", "quantity": 30, "efficiency": 0.6})
        self.assertEqual(normal, 84.13)
        self.assertGreater(slow, normal)

    def test_higher_week_raises_the_customer_price(self):
        steps = [
            {"id": "soldadura", "technician": "Ana"},
            {"id": "afinado", "technician": "Ana"},
        ]
        piece = {"piece_id": "acc_internos", "weld_cm": 30, "finish_cm": 30}

        def figures(week):
            return commission_figures(piece, {"steps": steps, "people": [{
                "name": "Ana", "salary_base": week, "salary_period": "weekly", "labor_efficiency": 0.6,
            }]})

        low = figures(850)
        high = figures(1700)
        self.assertGreater(high["pay"]["weld"], low["pay"]["weld"])
        self.assertGreater(high["quote"]["weld"], low["quote"]["weld"])
        self.assertGreater(high["quote"]["finish"], low["quote"]["finish"])
        self.assertGreater(low["quote"]["finish"], low["quote"]["weld"])

    def test_paint_stays_out_of_the_technician_pay(self):
        figures = commission_figures({
            "piece_id": "acc_internos",
            "paint_amount": 80,
            "weld_cm": 30,
        }, {"steps": [{"id": "soldadura", "technician": "Ana"}], "people": [{"name": "Ana", "labor_efficiency": 0.6, "salary_base": 850, "salary_period": "weekly"}]})
        self.assertEqual(figures["pay"]["weld"], 76.62)
        self.assertEqual(figures["quote"]["paint"], 80)
        self.assertGreater(figures["quote"]["total"], figures["pay"]["total"])

    def test_admin_help_raises_the_customer_price_by_a_quarter(self):
        piece = {
            "piece_id": "acc_internos",
            "mount_count": 100,
            "mount_technician": "Bruno",
        }
        people = [{"name": "Bruno", "labor_efficiency": 0.6, "salary_base": 850, "salary_period": "weekly"}]
        plain = commission_figures(piece, {"people": people})
        helped = commission_figures({**piece, "admin_help": True}, {"people": people})
        self.assertEqual(plain["quote"]["total"], 100)
        self.assertEqual(plain["quote"]["increase"], 0)
        self.assertEqual(helped["quote"]["piece_total"], 100)
        self.assertEqual(helped["quote"]["total"], 125)
        self.assertEqual(helped["quote"]["increase"], 25)
        self.assertEqual(helped["pay"]["total"], plain["pay"]["total"])
        self.assertTrue(helped["quote"]["admin_help"])

    def test_admin_help_also_raises_another_piece(self):
        figures = commission_figures({
            "piece_id": "otra",
            "custom_amount": 80,
            "admin_help": True,
        }, {})
        self.assertEqual(figures["quote"]["total"], 100)
        self.assertEqual(figures["pay"]["total"], 80)

    def test_admin_help_flag_is_kept(self):
        cleaned = normalize_commission({"piece_id": "acc_internos", "admin_help": True})
        self.assertTrue(cleaned["admin_help"])
        cleared = normalize_commission({"piece_id": "acc_internos", "admin_help": False})
        self.assertFalse(cleared["admin_help"])

    def test_free_multiplier_changes_only_the_quote(self):
        piece = {"piece_id": "acc_internos", "mount_count": 100, "mount_technician": "Bruno"}
        people = [{"name": "Bruno", "salary_base": 850, "salary_period": "weekly"}]
        plain = commission_figures(piece, {"people": people})
        doubled = commission_figures({**piece, "quote_multiplier": 2}, {"people": people})
        self.assertEqual(doubled["quote"]["total"], 200)
        self.assertEqual(doubled["pay"]["total"], plain["pay"]["total"])
        self.assertEqual(doubled["time"]["minutes"], plain["time"]["minutes"])

    def test_sheet_time_and_weld_without_margin(self):
        figures = commission_figures({
            "piece_id": "acc_internos",
            "weld_cm": 30,
            "finish_cm": 30,
        }, {"steps": [
            {"id": "soldadura", "technician": "Ana"},
            {"id": "afinado", "technician": "Ana"},
        ], "people": [{"name": "Ana", "salary_base": 850, "salary_period": "weekly"}]})
        self.assertEqual(figures["quote"]["weld"], 167)
        self.assertEqual(figures["quote"]["finish"], 358)
        self.assertEqual(figures["time"]["minutes"], 428.6)
        self.assertEqual(figures["pay"]["total"], 255)

    def test_empty_or_unpaid_task_is_zero(self):
        self.assertEqual(task_pay("acc_internos", {"task": "mount", "quantity": 1}), 17.03)
        self.assertEqual(task_pay("acc_internos", {"task": "mount", "quantity": 0}), 0)
        self.assertEqual(task_pay("no-existe", {"task": "weld", "quantity": 10}), 0)
        self.assertEqual(task_pay("espejos", {"task": "weld", "quantity": 10}), 0)


if __name__ == "__main__":
    main()
