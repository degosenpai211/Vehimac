"""Lógica de negocio para órdenes de trabajo."""

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.database import get_supabase


def _next_ot_number(db) -> int:
    result = db.table("work_orders").select("ot_number").order("ot_number", desc=True).limit(1).execute()
    if result.data and result.data[0].get("ot_number"):
        return int(result.data[0]["ot_number"]) + 1
    return 1


def _order_label(order: dict) -> str:
    ot = order.get("ot_number")
    return f"OT{ot}" if ot else "OT"


def _update_client_balance(db, client_id: str, delta: Decimal) -> None:
    client = db.table("clients").select("balance").eq("id", client_id).execute()
    if not client.data:
        return
    current = Decimal(str(client.data[0].get("balance", 0)))
    new_balance = float(current + delta)
    db.table("clients").update({
        "balance": new_balance,
        "balance_updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", client_id).execute()


def register_advance(order_id: UUID, force: bool = False) -> None:
    """Registra adelanto en finanzas y actualiza saldo del cliente."""
    db = get_supabase()
    oid = str(order_id)
    order_res = db.table("work_orders").select("*").eq("id", oid).execute()
    if not order_res.data:
        return
    order = order_res.data[0]

    if order.get("advance_recorded") and not force:
        return

    total = Decimal(str(order.get("price_charged", 0)))
    if total <= 0:
        return

    advance = Decimal(str(order.get("advance_amount", 0)))
    if advance <= 0:
        advance = (total / 2).quantize(Decimal("0.01"))

    existing = (
        db.table("finances")
        .select("id")
        .eq("work_order_id", oid)
        .ilike("description", "%Adelanto%")
        .execute()
    )
    if not existing.data:
        label = _order_label(order)
        db.table("finances").insert({
            "type": "ingreso",
            "description": f"Adelanto {label}",
            "amount": float(advance),
            "category": "Adelantos",
            "date": date.today().isoformat(),
            "work_order_id": oid,
        }).execute()

    db.table("work_orders").update({
        "advance_amount": float(advance),
        "advance_recorded": True,
    }).eq("id", oid).execute()

    client_id = order.get("client_id")
    if client_id:
        _update_client_balance(db, client_id, -advance)


def on_order_entregado(order_id: UUID) -> None:
    """Al entregar: registra el saldo restante (total - adelanto ya cobrado)."""
    db = get_supabase()
    oid = str(order_id)

    order_res = db.table("work_orders").select("*").eq("id", oid).execute()
    if not order_res.data:
        return
    order = order_res.data[0]

    if order.get("status") != "entregado":
        return

    if order.get("delivery_payment_recorded"):
        return

    total = Decimal(str(order.get("price_charged", 0)))
    if total <= 0:
        db.table("work_orders").update({"delivery_payment_recorded": True, "finance_recorded": True}).eq("id", oid).execute()
        return

    advance = Decimal(str(order.get("advance_amount", 0))) if order.get("advance_recorded") else Decimal("0")
    remaining = total - advance

    if remaining > 0:
        label = _order_label(order)
        db.table("finances").insert({
            "type": "ingreso",
            "description": f"Cobro final {label}",
            "amount": float(remaining),
            "category": "Servicios",
            "date": date.today().isoformat(),
            "work_order_id": oid,
        }).execute()

    db.table("work_orders").update({
        "delivery_payment_recorded": True,
        "finance_recorded": True,
    }).eq("id", oid).execute()
