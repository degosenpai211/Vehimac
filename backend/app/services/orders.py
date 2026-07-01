"""Lógica de negocio para órdenes de trabajo."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.database import get_supabase


def on_order_entregado(order_id: UUID) -> None:
    """Al entregar una orden al cliente: registra ingreso en finanzas si aún no fue registrado."""
    db = get_supabase()
    oid = str(order_id)

    order_res = db.table("work_orders").select("*").eq("id", oid).execute()
    if not order_res.data:
        return
    order = order_res.data[0]

    if order.get("status") != "entregado":
        return

    price = Decimal(str(order.get("price_charged", 0)))
    if price <= 0 or order.get("finance_recorded"):
        return

    existing = db.table("finances").select("id").eq("work_order_id", oid).execute()
    if existing.data:
        db.table("work_orders").update({"finance_recorded": True}).eq("id", oid).execute()
        return

    desc = order.get("work_description", "Orden de trabajo")
    db.table("finances").insert({
        "type": "ingreso",
        "description": f"Cobro orden: {desc[:80]}",
        "amount": float(price),
        "category": "Servicios",
        "date": date.today().isoformat(),
        "work_order_id": oid,
    }).execute()
    db.table("work_orders").update({"finance_recorded": True}).eq("id", oid).execute()
