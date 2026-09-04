from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from decimal import Decimal

from app.database import get_supabase
from app.schemas.finance import (
    FinanceCreate,
    FinanceResponse,
    FinanceSettingsUpdate,
    FinanceSummary,
    FinanceType,
    SalaryPayCreate,
)
from app.services.pl import (
    BY_ID,
    CATALOG,
    GROUPS,
    map_category,
    money,
    month_bounds,
    period_label,
    week_bounds,
)
from app.services.salary import jobs_for_worker, period_status, pick_period, recent_periods

router = APIRouter(prefix="/finances", tags=["Finanzas"])


@router.get("", response_model=list[FinanceResponse])
def list_finances(
    type: FinanceType | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    category: str | None = Query(None),
):
    db = get_supabase()
    query = db.table("finances").select("*").order("date", desc=True)

    if type:
        query = query.eq("type", type.value)
    if date_from:
        query = query.gte("date", date_from.isoformat())
    if date_to:
        query = query.lte("date", date_to.isoformat())
    if category:
        query = query.eq("category", category)

    result = query.execute()
    return result.data or []


@router.get("/summary/periods")
def period_summaries():
    from datetime import timedelta
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    if today.month == 1:
        last_month_start = date(today.year - 1, 12, 1)
        last_month_end = date(today.year - 1, 12, 31)
    else:
        last_month_start = date(today.year, today.month - 1, 1)
        last_month_end = date(today.year, today.month, 1) - timedelta(days=1)

    periods = {
        "today": _compute_summary(today.isoformat(), today.isoformat(), "Hoy"),
        "week": _compute_summary(week_start.isoformat(), today.isoformat(), "Esta semana"),
        "last_month": _compute_summary(last_month_start.isoformat(), last_month_end.isoformat(), "Mes pasado"),
    }

    db = get_supabase()
    for key, p in periods.items():
        d_from = today.isoformat() if key == "today" else (week_start.isoformat() if key == "week" else last_month_start.isoformat())
        d_to = today.isoformat() if key != "last_month" else last_month_end.isoformat()
        adv = (
            db.table("finances")
            .select("amount")
            .eq("type", "ingreso")
            .eq("category", "Adelantos")
            .gte("date", d_from)
            .lte("date", d_to)
            .execute()
        )
        total_adv = sum(Decimal(str(r["amount"])) for r in (adv.data or []))
        p_dict = p.model_dump(mode="json")
        p_dict["total_adelantos"] = float(total_adv)
        periods[key] = p_dict

    return periods


@router.get("/summary/daily", response_model=FinanceSummary)
def daily_summary(target_date: date | None = Query(None)):
    d = target_date or date.today()
    return _compute_summary(d.isoformat(), d.isoformat(), f"Día {d.strftime('%d/%m/%Y')}")


@router.get("/summary/monthly", response_model=FinanceSummary)
def monthly_summary(year: int | None = Query(None), month: int | None = Query(None)):
    today = date.today()
    y = year or today.year
    m = month or today.month
    date_from = date(y, m, 1)
    if m == 12:
        date_to = date(y + 1, 1, 1)
    else:
        date_to = date(y, m + 1, 1)
    # último día del mes
    from datetime import timedelta
    last_day = date_to - timedelta(days=1)
    period = f"{['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1]} {y}"
    return _compute_summary(date_from.isoformat(), last_day.isoformat(), period)


def _compute_summary(date_from: str, date_to: str, period: str) -> FinanceSummary:
    db = get_supabase()
    result = (
        db.table("finances")
        .select("*")
        .gte("date", date_from)
        .lte("date", date_to)
        .execute()
    )
    records = result.data or []

    ingresos = [r for r in records if r["type"] == "ingreso"]
    gastos = [r for r in records if r["type"] == "gasto"]

    total_ing = sum(Decimal(str(r["amount"])) for r in ingresos)
    total_gas = sum(Decimal(str(r["amount"])) for r in gastos)

    return FinanceSummary(
        period=period,
        total_ingresos=total_ing,
        total_gastos=total_gas,
        balance=total_ing - total_gas,
        count_ingresos=len(ingresos),
        count_gastos=len(gastos),
    )


def _insert_finance(db, data: dict) -> dict:
    payload = {k: v for k, v in data.items() if v is not None}
    if payload.get("work_order_id"):
        payload["work_order_id"] = str(payload["work_order_id"])
    if payload.get("mechanic_id"):
        payload["mechanic_id"] = str(payload["mechanic_id"])
    try:
        result = db.table("finances").insert(payload).execute()
    except Exception:
        payload.pop("mechanic_id", None)
        payload.pop("salary_period_key", None)
        result = db.table("finances").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear registro")
    return result.data[0]


@router.get("/salaries")
def salary_board():
    db = get_supabase()
    today = date.today()
    try:
        mechanics = (
            db.table("mechanics")
            .select("*")
            .eq("active", True)
            .order("name")
            .execute()
        ).data or []
    except Exception:
        mechanics = []
    for row in mechanics:
        row.setdefault("salary_base", 0)
        row.setdefault("salary_mode", "both")
        row.setdefault("salary_period", "monthly")
        row.setdefault("pay_day", 30)

    try:
        pays = (
            db.table("finances")
            .select("*")
            .eq("type", "gasto")
            .in_("category", ["Salarios", "Sueldos y salarios"])
            .execute()
        ).data or []
    except Exception:
        pays = []

    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = date(today.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)
    month_total = 0.0
    pays_by_mechanic = {}
    for p in pays:
        amt = float(p.get("amount") or 0)
        d = str(p.get("date") or "")[:10]
        if month_start.isoformat() <= d <= month_end.isoformat():
            month_total += amt
        mid = p.get("mechanic_id")
        if mid:
            pays_by_mechanic.setdefault(str(mid), []).append(p)

    since = (today - timedelta(days=60)).isoformat()
    try:
        orders = (
            db.table("work_orders")
            .select("id, ot_number, work_description, updated_at")
            .gte("updated_at", since)
            .execute()
        ).data or []
    except Exception:
        orders = []
    orders_by_id = {o["id"]: o for o in orders}
    items = []
    if orders_by_id:
        try:
            items = (
                db.table("order_items")
                .select("id, work_order_id, part_name, description, process")
                .in_("work_order_id", list(orders_by_id.keys()))
                .execute()
            ).data or []
        except Exception:
            items = []

    workers = []
    overdue = 0
    due_soon = 0
    for m in mechanics:
        mid = str(m["id"])
        mode = m.get("salary_mode") or "both"
        period_type = m.get("salary_period") or "monthly"
        pay_day = m.get("pay_day")
        base = float(m.get("salary_base") or 0)
        periods = recent_periods(today, period_type, pay_day)
        mine = pays_by_mechanic.get(mid, [])
        sums = {}
        last = None
        for p in mine:
            key = p.get("salary_period_key") or ""
            if key:
                sums[key] = sums.get(key, 0) + float(p.get("amount") or 0)
            if not last or str(p.get("date") or "") > str(last.get("date") or ""):
                last = p

        def settled(amount: float) -> bool:
            if mode == "per_job" or base <= 0:
                return amount > 0
            return amount + 0.009 >= base

        paid_keys = {k for k, v in sums.items() if settled(v)}
        current = pick_period(periods, paid_keys, today)
        paid_sum = sums.get(current["key"], 0)
        status = period_status(current, paid_sum, base, mode, today)
        if mode != "per_job" and base <= 0:
            status = "sin_config"
        if status == "vencido":
            overdue += 1
        if status == "en_plazo":
            due_soon += 1
        jobs = jobs_for_worker(
            items,
            orders_by_id,
            m.get("name") or "",
            current["start"],
            current["deadline"],
        )
        workers.append({
            "id": m["id"],
            "name": m.get("name"),
            "role": m.get("role") or "mechanic",
            "salary_base": base,
            "salary_mode": mode,
            "salary_period": period_type,
            "pay_day": pay_day,
            "period_key": current["key"],
            "period_label": current["label"],
            "payday": current["payday"].isoformat(),
            "deadline": current["deadline"].isoformat(),
            "legal_window": bool(current.get("legal_window")),
            "status": status,
            "paid_sum": paid_sum,
            "last_paid_at": (last or {}).get("date"),
            "last_paid_amount": float((last or {}).get("amount") or 0) if last else 0,
            "jobs": jobs,
        })

    return {
        "month_total": month_total,
        "overdue": overdue,
        "due_soon": due_soon,
        "workers": workers,
    }


@router.post("/salaries/pay", response_model=FinanceResponse, status_code=201)
def pay_salary(body: SalaryPayCreate):
    db = get_supabase()
    mechanic = (
        db.table("mechanics")
        .select("*")
        .eq("id", str(body.mechanic_id))
        .limit(1)
        .execute()
    )
    if not mechanic.data:
        raise HTTPException(status_code=404, detail="Integrante no encontrado")
    person = mechanic.data[0]
    total = (body.base_amount or 0) + (body.extra_amount or 0)
    bits = []
    if body.base_amount and body.base_amount > 0:
        bits.append("base")
    if body.extra_amount and body.extra_amount > 0:
        bits.append("trabajos")
    kind = " + ".join(bits) if bits else "pago"
    data = {
        "type": "gasto",
        "category": "Sueldos y salarios",
        "amount": float(total),
        "description": f"Salario {person.get('name')} ({kind})",
        "date": (body.date or date.today()).isoformat(),
        "mechanic_id": str(body.mechanic_id),
        "salary_period_key": body.period_key,
    }
    return _insert_finance(db, data)


def _finance_settings(db) -> dict:
    try:
        result = db.table("finance_settings").select("*").eq("id", "default").limit(1).execute()
        if result.data:
            row = result.data[0]
            return {
                "cash_opening": money(row.get("cash_opening")),
                "rent_1": money(row.get("rent_1")),
                "rent_2": money(row.get("rent_2")),
            }
    except Exception:
        pass
    return {"cash_opening": 0.0, "rent_1": 0.0, "rent_2": 0.0}


def _period_range(grain: str, offset: int, today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    if grain == "month":
        return month_bounds(today, offset)
    return week_bounds(today, offset)


@router.get("/catalog")
def finance_catalog():
    return {"groups": GROUPS, "rows": CATALOG}


@router.get("/settings")
def get_finance_settings():
    return _finance_settings(get_supabase())


@router.patch("/settings")
def update_finance_settings(body: FinanceSettingsUpdate):
    db = get_supabase()
    data = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos")
    try:
        existing = db.table("finance_settings").select("id").eq("id", "default").limit(1).execute()
        if existing.data:
            result = db.table("finance_settings").update(data).eq("id", "default").execute()
        else:
            result = db.table("finance_settings").insert({"id": "default", **data}).execute()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Falta la tabla de ajustes. Ejecutá migration_v13.sql en Supabase.",
        )
    if not result.data:
        raise HTTPException(status_code=500, detail="No se pudo guardar")
    return _finance_settings(db)


@router.post("/rents/{which}", response_model=FinanceResponse, status_code=201)
def pay_rent(which: int):
    if which not in (1, 2):
        raise HTTPException(status_code=400, detail="Alquiler 1 o 2")
    db = get_supabase()
    settings = _finance_settings(db)
    amount = settings["rent_1"] if which == 1 else settings["rent_2"]
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Definí el monto fijo del alquiler en Ajustes")
    label = f"Alquiler {which}"
    return _insert_finance(db, {
        "type": "gasto",
        "category": label,
        "amount": amount,
        "description": f"{label} (fijo)",
        "date": date.today().isoformat(),
    })


@router.get("/pl")
def profit_and_loss(
    grain: str = Query("week", description="week | month"),
    offset: int = Query(0, ge=-24, le=0),
):
    if grain not in ("week", "month"):
        raise HTTPException(status_code=400, detail="grain debe ser week o month")
    db = get_supabase()
    today = date.today()
    start, end = _period_range(grain, offset, today)
    settings = _finance_settings(db)

    records = (db.table("finances").select("type, amount, category, date").execute()).data or []
    totals = {c["id"]: 0.0 for c in CATALOG}
    lifetime_in = 0.0
    lifetime_out = 0.0
    for r in records:
        amt = money(r.get("amount"))
        tipo = r.get("type")
        if tipo == "ingreso":
            lifetime_in += amt
        else:
            lifetime_out += amt
        d = str(r.get("date") or "")[:10]
        if not (start.isoformat() <= d <= end.isoformat()):
            continue
        cid = map_category(r.get("category"), tipo)
        if tipo == "ingreso" and BY_ID.get(cid, {}).get("kind") == "gasto":
            cid = "otros_ingresos"
        if tipo == "gasto" and BY_ID.get(cid, {}).get("kind") == "ingreso":
            cid = "otros_egresos"
        totals[cid] = totals.get(cid, 0) + amt

    iva_facturado = 0.0
    try:
        orders = (
            db.table("work_orders")
            .select("billing_type, iva_amount, entry_date")
            .eq("billing_type", "con_factura")
            .gte("entry_date", start.isoformat())
            .lte("entry_date", end.isoformat())
            .execute()
        ).data or []
        iva_facturado = sum(money(o.get("iva_amount")) for o in orders)
    except Exception:
        iva_facturado = 0.0

    groups = []
    total_ingresos = 0.0
    total_egresos = 0.0
    for g in GROUPS:
        rows = []
        sub = 0.0
        for cat in CATALOG:
            if cat["group"] != g["id"]:
                continue
            amount = round(totals.get(cat["id"], 0), 2)
            rows.append({**cat, "amount": amount})
            sub += amount
            if cat["kind"] == "ingreso":
                total_ingresos += amount
            else:
                total_egresos += amount
        groups.append({"id": g["id"], "label": g["label"], "total": round(sub, 2), "rows": rows})

    series = []
    look = 5
    for i in range(-look, 1):
        s, e = _period_range(grain, offset + i, today)
        ing = 0.0
        egr = 0.0
        for r in records:
            d = str(r.get("date") or "")[:10]
            if not (s.isoformat() <= d <= e.isoformat()):
                continue
            amt = money(r.get("amount"))
            if r.get("type") == "ingreso":
                ing += amt
            else:
                egr += amt
        series.append({
            "label": period_label(grain, s, e) if grain == "month" else s.strftime("%d/%m"),
            "ingresos": round(ing, 2),
            "egresos": round(egr, 2),
        })

    return {
        "grain": grain,
        "offset": offset,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "label": period_label(grain, start, end),
        "groups": groups,
        "total_ingresos": round(total_ingresos, 2),
        "total_egresos": round(total_egresos, 2),
        "resultado": round(total_ingresos - total_egresos, 2),
        "iva_facturado": round(iva_facturado, 2),
        "efectivo": round(settings["cash_opening"] + lifetime_in - lifetime_out, 2),
        "cash_opening": settings["cash_opening"],
        "rent_1": settings["rent_1"],
        "rent_2": settings["rent_2"],
        "series": series,
    }


@router.get("/{finance_id}", response_model=FinanceResponse)
def get_finance(finance_id: UUID):
    db = get_supabase()
    result = db.table("finances").select("*").eq("id", str(finance_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return result.data[0]


@router.post("", response_model=FinanceResponse, status_code=201)
def create_finance(finance: FinanceCreate):
    db = get_supabase()
    data = finance.model_dump(mode="json")
    if not data.get("date"):
        data["date"] = date.today().isoformat()
    return _insert_finance(db, data)


@router.delete("/{finance_id}", status_code=204)
def delete_finance(finance_id: UUID):
    db = get_supabase()
    result = db.table("finances").delete().eq("id", str(finance_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
