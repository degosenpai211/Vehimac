from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from decimal import Decimal

from app.database import get_supabase
from app.schemas.finance import FinanceCreate, FinanceResponse, FinanceSummary, FinanceType

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
    if data.get("work_order_id"):
        data["work_order_id"] = str(data["work_order_id"])

    result = db.table("finances").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear registro")
    return result.data[0]


@router.delete("/{finance_id}", status_code=204)
def delete_finance(finance_id: UUID):
    db = get_supabase()
    result = db.table("finances").delete().eq("id", str(finance_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
