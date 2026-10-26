from unittest import TestCase
from unittest.mock import MagicMock

from app.services import orders as orders_service


def db_returning(order: dict) -> MagicMock:
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [order]
    return db


def updates_sent(db: MagicMock) -> list[dict]:
    return [call.args[0] for call in db.table.return_value.update.call_args_list]


class ReleaseOrderPaymentTests(TestCase):
    def movement(self, description: str, **extra) -> dict:
        return {"type": "ingreso", "work_order_id": "ot-1", "amount": 500, "description": description, **extra}

    def order(self, **extra) -> dict:
        return {
            "client_id": "c-1",
            "advance_recorded": True,
            "balance": -500,
            **extra,
        }

    def test_deleted_advance_reopens_order_and_restores_client_balance(self):
        db = db_returning(self.order())
        orders_service.release_order_payment(db, self.movement("Adelanto OT12"))
        sent = updates_sent(db)
        self.assertEqual(sent[0], {"advance_recorded": False})
        self.assertEqual(sent[1]["balance"], 0.0)

    def test_deleted_advance_does_nothing_when_it_was_not_recorded(self):
        db = db_returning(self.order(advance_recorded=False))
        orders_service.release_order_payment(db, self.movement("Adelanto OT12"))
        db.table.return_value.update.assert_not_called()

    def test_deleted_qr_payment_clears_the_mark(self):
        db = db_returning(self.order())
        orders_service.release_order_payment(db, self.movement("Pago QR OT12 (BNB)"))
        self.assertEqual(
            updates_sent(db),
            [{"qr_paid": False, "qr_bank": None, "qr_paid_amount": 0, "qr_paid_at": None}],
        )

    def test_deleted_final_payment_reopens_the_delivery(self):
        db = db_returning(self.order())
        orders_service.release_order_payment(db, self.movement("Cobro final OT12"))
        self.assertEqual(
            updates_sent(db),
            [{"delivery_payment_recorded": False, "finance_recorded": False}],
        )

    def test_other_movements_do_not_change_the_order(self):
        db = db_returning(self.order())
        orders_service.release_order_payment(db, self.movement("Venta de repuesto"))
        db.table.return_value.update.assert_not_called()
        untouched = MagicMock()
        orders_service.release_order_payment(untouched, self.movement("Adelanto OT12", work_order_id=None))
        orders_service.release_order_payment(untouched, self.movement("Adelanto OT12", type="gasto"))
        untouched.table.assert_not_called()
