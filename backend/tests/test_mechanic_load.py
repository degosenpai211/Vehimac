from datetime import date
from unittest import TestCase

from app.services.mechanic_load import build_workload, open_orders

TODAY = date(2026, 10, 13)


def _source(people, orders, items=None):
    return {"people": people, "orders": orders, "items": items or []}


class MechanicLoadTests(TestCase):
    def test_counts_open_overdue_and_delivered(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [
            {
                "id": "o1",
                "ot_number": 4,
                "status": "en_proceso",
                "mechanic": "Ana",
                "entry_date": "2026-10-01",
                "estimated_delivery_date": "2026-10-10",
                "clients": {"name": "Luis"},
            },
            {
                "id": "o2",
                "ot_number": 5,
                "status": "entregado",
                "mechanic": "Ana",
                "entry_date": "2026-09-01",
                "estimated_delivery_date": "2026-09-02",
                "clients": {"name": "Eva"},
            },
        ]
        rows = build_workload(_source(people, orders), TODAY)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["total"], 2)
        self.assertEqual(rows[0]["overdue"], 1)
        self.assertEqual(rows[0]["delivered"], 1)
        self.assertEqual(rows[0]["open"], 1)
        self.assertEqual(rows[0]["orders"][1]["assigned_on"], "")
        self.assertEqual(rows[0]["orders"][1]["entry_on"], "2026-10-01")

    def test_old_order_without_assignment_uses_entry_date(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 1,
            "status": "terminado",
            "mechanic": "Ana",
            "entry_date": "2026-08-02",
            "estimated_delivery_date": "2026-12-01",
            "clients": {"name": "Leo"},
        }]
        items = [{"work_order_id": "o1", "process": {"steps": [{"technician": "Ana", "assigned_at": ""}]}}]
        rows = build_workload(_source(people, orders, items), TODAY)
        order = rows[0]["orders"][0]
        self.assertEqual(order["assigned_on"], "")
        self.assertEqual(order["entry_on"], "2026-08-02")
        self.assertEqual(order["steps"][0]["assigned_at"], "")
        self.assertFalse(order["overdue"])

    def test_uses_step_date_and_skips_other_names(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 9,
            "status": "en_proceso",
            "mechanic": "Bruno",
            "entry_date": "2026-01-01",
            "estimated_delivery_date": "2026-10-01",
            "clients": {"name": "Nico"},
        }]
        items = [{
            "work_order_id": "o1",
            "process": {"steps": [{"technician": "Ana", "assigned_at": "2026-10-05T10:00"}]},
        }]
        rows = build_workload(_source(people, orders, items), TODAY)
        self.assertEqual(rows[0]["total"], 1)
        self.assertEqual(rows[0]["orders"][0]["assigned_on"], "2026-10-05")
        self.assertEqual(rows[0]["orders"][0]["assigned_at"], "2026-10-05T10:00")
        self.assertEqual(rows[0]["orders"][0]["entry_on"], "2026-01-01")
        self.assertEqual(rows[0]["orders"][0]["steps"][0]["assigned_on"], "2026-10-05")
        self.assertEqual(rows[0]["orders"][0]["steps"][0]["assigned_at"], "2026-10-05T10:00")
        self.assertEqual(rows[0]["orders"][0]["steps"][0]["status"], "en_proceso")
        self.assertTrue(rows[0]["orders"][0]["overdue"])

    def test_completed_step_keeps_process_close_day(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 3,
            "status": "en_proceso",
            "mechanic": "",
            "entry_date": "2026-10-01",
            "clients": {"name": "Leo"},
        }]
        items = [{
            "work_order_id": "o1",
            "part_name": "Tapa",
            "process": {
                "delivered_at": "2026-10-12T15:00",
                "steps": [{
                    "id": "soldadura",
                    "technician": "Ana",
                    "status": "completado",
                    "assigned_at": "2026-10-02T09:00",
                }],
            },
        }]
        step = build_workload(_source(people, orders, items), TODAY)[0]["orders"][0]["steps"][0]
        self.assertEqual(step["id"], "soldadura")
        self.assertEqual(step["part_name"], "Tapa")
        self.assertEqual(step["assigned_on"], "2026-10-02")
        self.assertEqual(step["closed_on"], "2026-10-12")

    def test_finished_day_is_bolivia_time_and_only_when_delivered(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [
            {
                "id": "done",
                "ot_number": 8,
                "status": "entregado",
                "mechanic": "Ana",
                "entry_date": "2026-10-01",
                "updated_at": "2026-10-15T02:30:00+00:00",
                "clients": {"name": "Leo"},
            },
            {
                "id": "open",
                "ot_number": 9,
                "status": "en_proceso",
                "mechanic": "Ana",
                "entry_date": "2026-10-02",
                "updated_at": "2026-10-15T02:30:00+00:00",
                "clients": {"name": "Nico"},
            },
        ]
        rows = build_workload(_source(people, orders), TODAY)
        by_id = {row["id"]: row for row in rows[0]["orders"]}
        self.assertEqual(by_id["done"]["finished_on"], "2026-10-14")
        self.assertEqual(by_id["open"]["finished_on"], "")

    def test_admin_is_left_out(self):
        people = [{"id": "a1", "name": "Oficina", "role": "admin"}]
        orders = [{
            "id": "o1",
            "ot_number": 1,
            "status": "en_proceso",
            "mechanic": "Oficina",
            "entry_date": "2026-10-01",
            "clients": {},
        }]
        self.assertEqual(build_workload(_source(people, orders), TODAY), [])

    def test_unassigned_skips_orders_with_a_technician_or_already_delivered(self):
        from app.services.mechanic_load import unassigned_orders

        orders = [
            {"id": "open", "ot_number": 2, "status": "en_proceso", "work_description": "Sin técnico", "clients": {"name": "Ana"}},
            {"id": "named", "ot_number": 3, "status": "en_proceso", "clients": {"name": "Luis"}},
            {"id": "done", "ot_number": 1, "status": "entregado", "clients": {"name": "Eva"}},
        ]
        items = [
            {"work_order_id": "named", "process": {"steps": [{"technician": "Ana"}]}},
        ]
        rows = unassigned_orders(_source([], orders, items))
        self.assertEqual([row["id"] for row in rows], ["open"])
        self.assertEqual(
            rows[0]["pieces"][0]["missing"],
            ["diseno", "soldadura", "afinado", "pintura", "instalacion"],
        )

    def test_unassigned_piece_lists_only_steps_without_a_technician(self):
        from app.services.mechanic_load import unassigned_orders

        orders = [{"id": "open", "ot_number": 4, "status": "en_proceso", "clients": {"name": "Ana"}}]
        items = [{
            "work_order_id": "open",
            "part_name": "Tapa",
            "process": {"steps": [
                {"id": "diseno", "technician": ""},
                {"id": "soldadura", "technician": "   "},
            ]},
        }]
        pieces = unassigned_orders(_source([], orders, items))[0]["pieces"]
        self.assertEqual(pieces[0]["part_name"], "Tapa")
        self.assertEqual(pieces[0]["missing"], ["diseno", "soldadura", "afinado", "pintura", "instalacion"])

    def test_finished_on_uses_bolivia_day_and_process_close_stays_local(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 8,
            "status": "entregado",
            "mechanic": "Ana",
            "entry_date": "2026-10-01",
            "updated_at": "2026-10-15T02:30:00+00:00",
            "clients": {"name": "Leo"},
        }]
        items = [{
            "work_order_id": "o1",
            "process": {
                "delivered_at": "2026-10-13T10:00",
                "steps": [{"technician": "Ana", "status": "completado", "assigned_at": "2026-10-02T09:00"}],
            },
        }]
        order = build_workload(_source(people, orders, items), TODAY)[0]["orders"][0]
        self.assertEqual(order["finished_on"], "2026-10-14")
        self.assertEqual(order["steps"][0]["closed_on"], "2026-10-13")

    def test_price_stays_on_the_order_and_the_piece(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 80,
            "status": "en_proceso",
            "mechanic": "Ana",
            "price_charged": 100,
            "total_amount": 300,
            "entry_date": "2026-10-01",
            "clients": {"name": "Leo"},
        }]
        items = [
            {
                "work_order_id": "o1",
                "part_name": "Tapa",
                "amount": 120,
                "process": {"steps": [
                    {"id": "soldadura", "technician": "Ana", "status": "en_proceso"},
                    {"id": "pintura", "technician": "Ana", "status": "pendiente"},
                    {"id": "diseno", "technician": "Bruno", "status": "completado"},
                ]},
            },
            {
                "work_order_id": "o1",
                "part_name": "Base",
                "amount": 80,
                "process": {"steps": [
                    {"id": "soldadura", "technician": "Bruno", "status": "en_proceso"},
                ]},
            },
        ]
        order = build_workload(_source(people, orders, items), TODAY)[0]["orders"][0]
        self.assertEqual(order["price"], 300.0)
        self.assertEqual(order["pay"]["total"], 0)
        self.assertEqual(len(order["steps"]), 2)
        self.assertEqual({step["part_amount"] for step in order["steps"]}, {120.0})
        self.assertEqual(sorted(step["id"] for step in order["steps"]), ["pintura", "soldadura"])

    def test_pay_follows_the_named_technician(self):
        people = [
            {"id": "m1", "name": "Ana", "role": "mechanic", "salary_base": 850, "salary_period": "weekly"},
            {"id": "m2", "name": "Bruno", "role": "mechanic", "salary_base": 850, "salary_period": "weekly"},
        ]
        orders = [{
            "id": "o1",
            "ot_number": 12,
            "status": "en_proceso",
            "mechanic": "Ana",
            "entry_date": "2026-10-01",
            "clients": {"name": "Leo"},
        }]
        items = [{
            "work_order_id": "o1",
            "process": {
                "commission": {
                    "piece_id": "acc_internos",
                    "weld_cm": 30,
                    "finish_cm": 30,
                    "mount_count": 1,
                    "mount_technician": "Bruno",
                },
                "steps": [
                    {"id": "soldadura", "technician": "Ana", "status": "completado"},
                    {"id": "afinado", "technician": "Ana", "status": "en_proceso"},
                    {"id": "pintura", "technician": "Ana", "status": "completado"},
                ],
            },
        }]
        rows = {row["name"]: row for row in build_workload(_source(people, orders, items), TODAY)}
        ana = rows["Ana"]["orders"][0]["pay"]
        bruno = rows["Bruno"]["orders"][0]["pay"]
        self.assertEqual(ana["weld"], 52.58)
        self.assertEqual(ana["finish"], 122.69)
        self.assertEqual(ana["mount"], 0)
        self.assertEqual(ana["total"], 175.27)
        self.assertEqual(bruno["mount"], 11.68)
        self.assertEqual(bruno["total"], 11.68)
        self.assertEqual(bruno["weld"], 0)

    def test_other_piece_uses_the_written_amount(self):
        people = [{"id": "m1", "name": "Luis", "role": "mechanic"}]
        orders = [{
            "id": "o1",
            "ot_number": 13,
            "status": "en_proceso",
            "mechanic": "Luis",
            "entry_date": "2026-10-01",
            "clients": {"name": "Leo"},
        }]
        items = [{
            "work_order_id": "o1",
            "process": {
                "commission": {
                    "piece_id": "otra",
                    "custom_amount": 150,
                    "custom_technician": "Luis",
                    "custom_note": "Soporte",
                },
                "steps": [{"id": "soldadura", "technician": "Luis"}],
            },
        }]
        pay = build_workload(_source(people, orders, items), TODAY)[0]["orders"][0]["pay"]
        self.assertEqual(pay["other"], 150)
        self.assertEqual(pay["weld"], 0)
        self.assertEqual(pay["total"], 150)

    def test_saved_pay_stays_when_efficiency_changes(self):
        people = [{"id": "m1", "name": "Ana", "role": "mechanic", "labor_efficiency": 0.4}]
        orders = [{
            "id": "o1",
            "ot_number": 14,
            "status": "en_proceso",
            "mechanic": "Ana",
            "entry_date": "2026-10-01",
            "clients": {"name": "Leo"},
        }]
        items = [{
            "work_order_id": "o1",
            "process": {
                "commission": {
                    "piece_id": "acc_internos",
                    "weld_cm": 30,
                    "applied": {"pay": {"weld": 10, "total": 10}, "allowed": {"weld": 40}},
                },
                "steps": [{
                    "id": "soldadura",
                    "technician": "Ana",
                    "status": "completado",
                    "assigned_at": "2026-10-02T09:00",
                    "completed_at": "2026-10-02T10:30",
                }],
            },
        }]
        order = build_workload(_source(people, orders, items), TODAY)[0]["orders"][0]
        self.assertEqual(order["pay"]["weld"], 10)
        self.assertEqual(order["pay"]["total"], 10)
        self.assertEqual(order["time"]["weld"]["allowed"], 40)
        self.assertEqual(order["time"]["weld"]["actual"], 90)

    def test_open_order_multiplier_raises_only_the_piece_price(self):
        people = [{
            "name": "Bruno",
            "labor_efficiency": 0.6,
            "salary_base": 850,
            "salary_period": "weekly",
        }]
        orders = [
            {"id": "o1", "ot_number": 80, "status": "en_proceso", "clients": {"name": "Ana"}},
            {"id": "o2", "ot_number": 81, "status": "terminado", "clients": {"name": "Ana"}},
            {"id": "o3", "ot_number": 82, "status": "entregado", "clients": {"name": "Ana"}},
        ]
        items = [
            {
                "id": "i1",
                "work_order_id": "o1",
                "part_name": "Puerta",
                "process": {"commission": {
                    "piece_id": "acc_internos",
                    "mount_count": 100,
                    "mount_technician": "Bruno",
                    "admin_help": True,
                }, "steps": []},
            },
            {
                "id": "i2",
                "work_order_id": "o1",
                "part_name": "Capó",
                "process": {"commission": {
                    "piece_id": "acc_internos",
                    "mount_count": 100,
                    "admin_help": False,
                }, "steps": []},
            },
        ]
        rows = open_orders({"people": people, "orders": orders, "items": items, "rates": {}})
        self.assertEqual({row["id"] for row in rows}, {"o1", "o2"})
        door = next(row for row in rows if row["id"] == "o1")["pieces"][0]
        self.assertEqual(door["piece_total"], 100)
        self.assertEqual(door["quote_total"], 125)
        self.assertEqual(door["increase"], 25)
        self.assertTrue(door["admin_help"])
        hood = next(row for row in rows if row["id"] == "o1")["pieces"][1]
        self.assertEqual(hood["quote_total"], 0)
        self.assertEqual(hood["increase"], 0)
        self.assertFalse(hood["admin_help"])
