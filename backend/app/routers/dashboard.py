from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Query

from app.database import get_supabase

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

PERIODS = {
    "today": 0,
    "3d": 3,
    "7d": 7,
    "30d": 30,
    "90d": 90,
}


def _sum_finances(records: list) -> dict:
    ingresos = Decimal("0")
    gastos = Decimal("0")
    for f in records:
        amt = Decimal(str(f["amount"]))
        if f["type"] == "ingreso":
            ingresos += amt
        else:
            gastos += amt
    return {
        "total_ingresos": float(ingresos),
        "total_gastos": float(gastos),
        "balance": float(ingresos - gastos),
        "count_ingresos": sum(1 for f in records if f["type"] == "ingreso"),
        "count_gastos": sum(1 for f in records if f["type"] == "gasto"),
    }


def _as_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _order_brief(row: dict) -> dict:
    client = row.get("clients")
    return {
        "id": row["id"],
        "ot_number": row.get("ot_number"),
        "work_description": row.get("work_description"),
        "status": row.get("status"),
        "estimated_delivery_date": row.get("estimated_delivery_date"),
        "client_name": client["name"] if client else None,
    }


def _delivery_agenda(db, today: date) -> dict:
    result = (
        db.table("work_orders")
        .select("id, ot_number, work_description, status, estimated_delivery_date, clients(name)")
        .in_("status", ["en_proceso", "terminado"])
        .execute()
    )
    due_today, tomorrow, day_after, next_week = [], [], [], []
    t1 = today + timedelta(days=1)
    t2 = today + timedelta(days=2)
    next_mon = today + timedelta(days=(7 - today.weekday()) or 7)
    next_sun = next_mon + timedelta(days=6)
    for row in result.data or []:
        d = _as_date(row.get("estimated_delivery_date"))
        if not d:
            continue
        item = _order_brief(row)
        if d == today:
            due_today.append(item)
        elif d == t1:
            tomorrow.append(item)
        elif d == t2:
            day_after.append(item)
        elif next_mon <= d <= next_sun:
            next_week.append(item)
    return {
        "due_today": due_today,
        "due_tomorrow": tomorrow,
        "due_day_after": day_after,
        "due_next_week": next_week,
    }


@router.get("/stats")
def get_dashboard_stats():
    db = get_supabase()
    today = date.today()

    clients = db.table("clients").select("id", count="exact").execute()
    orders_active = (
        db.table("work_orders")
        .select("id", count="exact")
        .in_("status", ["en_proceso", "terminado"])
        .execute()
    )

    orders_by_status = {}
    for status in ["en_proceso", "terminado", "entregado"]:
        r = db.table("work_orders").select("id", count="exact").eq("status", status).execute()
        orders_by_status[status] = r.count or 0

    stored_pieces = (
        db.table("work_orders")
        .select("id", count="exact")
        .eq("status", "terminado")
        .execute()
    )

    overdue_orders = (
        db.table("work_orders")
        .select("id, work_description, estimated_delivery_date, clients(name)")
        .lt("estimated_delivery_date", today.isoformat())
        .eq("status", "en_proceso")
        .order("estimated_delivery_date")
        .limit(10)
        .execute()
    )
    overdue_list = []
    for o in overdue_orders.data or []:
        client = o.pop("clients", None)
        o["client_name"] = client["name"] if client else None
        overdue_list.append(o)

    stale_terminado = (
        db.table("work_orders")
        .select("id, work_description, updated_at, clients(name)")
        .eq("status", "terminado")
        .lt("updated_at", (today - timedelta(days=7)).isoformat())
        .order("updated_at")
        .limit(10)
        .execute()
    )
    stale_list = []
    for o in stale_terminado.data or []:
        client = o.pop("clients", None)
        o["client_name"] = client["name"] if client else None
        stale_list.append(o)

    return {
        "total_clients": clients.count or 0,
        "active_orders": orders_active.count or 0,
        "stored_pieces_count": stored_pieces.count or 0,
        "orders_by_status": orders_by_status,
        "overdue_orders": overdue_list,
        "stale_stored_pieces": stale_list,
        "delivery_agenda": _delivery_agenda(db, today),
    }


@router.get("/finance-trends")
def get_finance_trends():
    db = get_supabase()
    today = date.today()
    trends = {}

    for key, days in PERIODS.items():
        date_from = (today - timedelta(days=days)).isoformat()
        result = (
            db.table("finances")
            .select("type, amount")
            .gte("date", date_from)
            .lte("date", today.isoformat())
            .execute()
        )
        summary = _sum_finances(result.data or [])
        summary["period"] = key
        summary["label"] = {
            "today": "Hoy",
            "3d": "Últimos 3 días",
            "7d": "Última semana",
            "30d": "Último mes",
            "90d": "Últimos 3 meses",
        }[key]
        trends[key] = summary

    return trends
