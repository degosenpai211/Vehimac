from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter

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


def _num(value) -> Decimal:
    return Decimal(str(value or 0))


def _order_total(row: dict) -> Decimal:
    total = row.get("total_amount")
    if total is not None and _num(total) > 0:
        return _num(total)
    return _num(row.get("price_charged"))


def _remaining(row: dict) -> Decimal:
    total = _order_total(row)
    adv = _num(row.get("advance_amount")) if row.get("advance_recorded") else Decimal("0")
    qr = _num(row.get("qr_paid_amount")) if row.get("qr_paid") else Decimal("0")
    left = total - adv - qr
    return left if left > 0 else Decimal("0")


def _order_brief(row: dict) -> dict:
    client = row.get("clients") or {}
    if not isinstance(client, dict):
        client = {}
    return {
        "id": row["id"],
        "ot_number": row.get("ot_number"),
        "work_description": row.get("work_description"),
        "status": row.get("status"),
        "estimated_delivery_date": row.get("estimated_delivery_date"),
        "client_name": client.get("name"),
    }


def _delivery_agenda(orders: list, today: date) -> dict:
    due_today, tomorrow, day_after, next_week = [], [], [], []
    t1 = today + timedelta(days=1)
    t2 = today + timedelta(days=2)
    next_mon = today + timedelta(days=(7 - today.weekday()) or 7)
    next_sun = next_mon + timedelta(days=6)
    for row in orders:
        if row.get("status") not in ("en_proceso", "terminado"):
            continue
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


def _finance_range(records: list, date_from: date, date_to: date) -> dict:
    sliced = []
    for f in records:
        d = _as_date(f.get("date"))
        if d and date_from <= d <= date_to:
            sliced.append(f)
    return _sum_finances(sliced)


def _build_kpis(orders: list, finances: list, proformas: list, today: date) -> dict:
    week_start = today - timedelta(days=today.weekday())
    month_start = date(today.year, today.month, 1)
    today_fin = _finance_range(finances, today, today)
    week_fin = _finance_range(finances, week_start, today)
    month_fin = _finance_range(finances, month_start, today)

    active = [o for o in orders if o.get("status") in ("en_proceso", "terminado")]
    overdue = [
        o for o in active
        if (d := _as_date(o.get("estimated_delivery_date"))) and d < today
    ]
    due_today = [
        o for o in active
        if _as_date(o.get("estimated_delivery_date")) == today
    ]
    due_tomorrow = [
        o for o in active
        if _as_date(o.get("estimated_delivery_date")) == today + timedelta(days=1)
    ]

    to_collect = sum((_remaining(o) for o in active), Decimal("0"))
    advances_month = Decimal("0")
    income_qr = Decimal("0")
    income_plastic = Decimal("0")
    income_month = Decimal("0")
    for f in finances:
        d = _as_date(f.get("date"))
        if not d or d < month_start or d > today:
            continue
        amt = _num(f.get("amount"))
        if f.get("type") != "ingreso":
            continue
        income_month += amt
        cat = (f.get("category") or "").lower()
        if "adelanto" in cat:
            advances_month += amt
        if cat == "qr":
            income_qr += amt
        if "plastic" in cat:
            income_plastic += amt

    delivered_month = []
    days_acc = []
    for o in orders:
        if o.get("status") != "entregado":
            continue
        upd = _as_date(o.get("updated_at"))
        if upd and upd >= month_start:
            delivered_month.append(o)
            entry = _as_date(o.get("entry_date"))
            if entry and upd:
                days_acc.append((upd - entry).days)

    tickets = [_order_total(o) for o in delivered_month]
    avg_ticket = float(sum(tickets) / len(tickets)) if tickets else 0
    avg_days = round(sum(days_acc) / len(days_acc), 1) if days_acc else 0

    stale = [
        o for o in orders
        if o.get("status") == "terminado"
        and (u := _as_date(o.get("updated_at")))
        and u <= today - timedelta(days=7)
    ]

    mix_invoice = sum(1 for o in orders if o.get("billing_type") == "con_factura")
    mix_plain = sum(1 for o in orders if o.get("billing_type") != "con_factura")

    converted = sum(1 for p in proformas if p.get("status") == "convertida")
    prof_total = len(proformas)
    conversion = round((converted / prof_total) * 100, 1) if prof_total else 0
    overdue_pct = round((len(overdue) / len(active)) * 100, 1) if active else 0

    return {
        "income_today": today_fin["total_ingresos"],
        "income_week": week_fin["total_ingresos"],
        "income_month": month_fin["total_ingresos"],
        "expenses_today": today_fin["total_gastos"],
        "expenses_week": week_fin["total_gastos"],
        "expenses_month": month_fin["total_gastos"],
        "balance_today": today_fin["balance"],
        "balance_week": week_fin["balance"],
        "balance_month": month_fin["balance"],
        "to_collect": float(to_collect),
        "advances_month": float(advances_month),
        "avg_ticket": round(avg_ticket, 2),
        "avg_days": avg_days,
        "delivered_month": len(delivered_month),
        "overdue_count": len(overdue),
        "overdue_pct": overdue_pct,
        "due_today_count": len(due_today),
        "due_tomorrow_count": len(due_tomorrow),
        "stale_pieces_count": len(stale),
        "active_orders": len(active),
        "mix_invoice": mix_invoice,
        "mix_plain": mix_plain,
        "income_qr_month": float(income_qr),
        "income_plastic_month": float(income_plastic),
        "income_other_month": float(max(Decimal("0"), income_month - income_qr - income_plastic)),
        "proformas_total": prof_total,
        "proformas_converted": converted,
        "proformas_conversion_pct": conversion,
    }


@router.get("/stats")
def get_dashboard_stats():
    db = get_supabase()
    today = date.today()

    clients = db.table("clients").select("id", count="exact").execute()
    orders_res = (
        db.table("work_orders")
        .select(
            "id, ot_number, work_description, status, billing_type, total_amount, "
            "price_charged, advance_amount, advance_recorded, qr_paid, qr_paid_amount, "
            "estimated_delivery_date, entry_date, updated_at, clients(name)"
        )
        .execute()
    )
    orders = orders_res.data or []

    orders_by_status = {"en_proceso": 0, "terminado": 0, "entregado": 0}
    for o in orders:
        st = o.get("status")
        if st in orders_by_status:
            orders_by_status[st] += 1

    stored_pieces_count = orders_by_status["terminado"]
    active_orders = orders_by_status["en_proceso"] + orders_by_status["terminado"]

    agenda = _delivery_agenda(orders, today)
    overdue_list = [
        _order_brief(o)
        for o in orders
        if o.get("status") in ("en_proceso", "terminado")
        and (d := _as_date(o.get("estimated_delivery_date")))
        and d < today
    ]
    overdue_list.sort(key=lambda x: x.get("estimated_delivery_date") or "")

    stale_list = [
        _order_brief(o)
        for o in orders
        if o.get("status") == "terminado"
        and (u := _as_date(o.get("updated_at")))
        and u <= today - timedelta(days=7)
    ]

    finances = (
        db.table("finances")
        .select("type, amount, category, date")
        .gte("date", date(today.year, 1, 1).isoformat())
        .execute()
    ).data or []
    try:
        proformas = (db.table("proformas").select("id, status").execute()).data or []
    except Exception:
        proformas = []

    alarms = {
        "overdue": overdue_list,
        "due_today": agenda["due_today"],
        "due_tomorrow": agenda["due_tomorrow"],
    }

    return {
        "total_clients": clients.count or 0,
        "active_orders": active_orders,
        "stored_pieces_count": stored_pieces_count,
        "orders_by_status": orders_by_status,
        "overdue_orders": overdue_list[:20],
        "stale_stored_pieces": stale_list[:20],
        "delivery_agenda": agenda,
        "alarms": alarms,
        "kpis": _build_kpis(orders, finances, proformas, today),
    }


@router.get("/finance-trends")
def get_finance_trends():
    db = get_supabase()
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = date(today.year, today.month, 1)
    lookback = (today - timedelta(days=90)).isoformat()
    records = (
        db.table("finances")
        .select("type, amount, date")
        .gte("date", lookback)
        .lte("date", today.isoformat())
        .execute()
    ).data or []

    trends = {}
    for key, days in PERIODS.items():
        date_from = today - timedelta(days=days)
        summary = _finance_range(records, date_from, today)
        summary["period"] = key
        summary["label"] = {
            "today": "Hoy",
            "3d": "Últimos 3 días",
            "7d": "Última semana",
            "30d": "Último mes",
            "90d": "Últimos 3 meses",
        }[key]
        trends[key] = summary

    calendar = {
        "today": (today, today, "Hoy"),
        "week": (week_start, today, "Esta semana"),
        "month": (month_start, today, "Este mes"),
    }
    for key, (d_from, d_to, label) in calendar.items():
        summary = _finance_range(records, d_from, d_to)
        summary["period"] = key
        summary["label"] = label
        trends[key] = summary

    return trends
