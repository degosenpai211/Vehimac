from decimal import Decimal
from unittest import TestCase, main
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.routers import work_orders as orders_router
from app.schemas.work_order import OrderItemCreate, WorkOrderUpdate
from app.services import orders as orders_service
from app.utils.search import sanitize_search


def db_returning(order: dict) -> MagicMock:
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [order]
    return db


class UpdateOrderTests(TestCase):
    def test_rejected_advance_keeps_old_pieces(self):
        old = {"id": "x", "status": "en_proceso", "advance_amount": 500, "advance_recorded": False}
        body = WorkOrderUpdate(pieces=[OrderItemCreate(description="Soldar", amount=Decimal("100"))])
        with patch.object(orders_router, "get_supabase", return_value=db_returning(old)), \
                patch.object(orders_router, "_insert_pieces") as insert_pieces:
            with self.assertRaises(HTTPException) as raised:
                orders_router.update_work_order(uuid4(), body)
        self.assertEqual(raised.exception.status_code, 400)
        insert_pieces.assert_not_called()


class QrPaymentTests(TestCase):
    def test_rejects_payment_when_nothing_is_owed(self):
        paid_up = {
            "id": "x",
            "total_amount": 100,
            "advance_amount": 100,
            "advance_recorded": True,
            "qr_paid": False,
        }
        db = db_returning(paid_up)
        with patch.object(orders_service, "get_supabase", return_value=db):
            with self.assertRaises(HTTPException) as raised:
                orders_service.register_qr_payment(uuid4(), "BNB", Decimal("50"))
        self.assertEqual(raised.exception.status_code, 400)
        db.table.return_value.insert.assert_not_called()

    def test_caps_payment_at_what_is_owed(self):
        half_paid = {
            "id": "x",
            "total_amount": 100,
            "advance_amount": 40,
            "advance_recorded": True,
            "qr_paid": False,
        }
        db = db_returning(half_paid)
        with patch.object(orders_service, "get_supabase", return_value=db):
            orders_service.register_qr_payment(uuid4(), "BNB", Decimal("90"))
        recorded = db.table.return_value.insert.call_args.args[0]
        self.assertEqual(recorded["amount"], 60.0)


class SanitizeSearchTests(TestCase):
    def test_strips_filter_breaking_characters(self):
        self.assertEqual(sanitize_search("Perez, Juan (taller)"), "Perez Juan taller")

    def test_only_symbols_leaves_nothing(self):
        self.assertEqual(sanitize_search(" ,() % "), "")


if __name__ == "__main__":
    main()
