from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import fetch_all, get_supabase
from app.schemas.mechanic import MechanicCreate, MechanicResponse, MechanicUpdate
from app.services.mechanic_load import build_workload, open_orders, unassigned_orders
from app.services.tariff import list_changes, read_rates, remember_change
from app.utils.dates import today_bolivia

router = APIRouter(prefix="/mechanics", tags=["Mecánicos"])

def _mechanic_row(row: dict) -> dict:
    row.setdefault("role", "mechanic")
    row.setdefault("salary_base", 0)
    row.setdefault("salary_mode", "both")
    row.setdefault("salary_period", "monthly")
    row.setdefault("pay_day", 30)
    row.setdefault("labor_efficiency", 0.6)
    return row


@router.get("", response_model=list[MechanicResponse], response_model_exclude_unset=True)
def list_mechanics(
    search: str | None = Query(None),
    prefix: bool = Query(False),
    active_only: bool = Query(True),
    role: str | None = Query(None, description="mechanic | designer | admin"),
    limit: int = Query(50, ge=1, le=200),
):
    db = get_supabase()
    query = db.table("mechanics").select("*").order("name")
    if active_only:
        query = query.eq("active", True)
    if role in ("mechanic", "designer", "admin"):
        query = query.eq("role", role)
    if search:
        pattern = f"{search}%" if prefix else f"%{search}%"
        query = query.ilike("name", pattern)
    try:
        result = query.limit(limit).execute()
    except Exception:
        query = db.table("mechanics").select("*").order("name")
        if active_only:
            query = query.eq("active", True)
        if search:
            pattern = f"{search}%" if prefix else f"%{search}%"
            query = query.ilike("name", pattern)
        result = query.limit(limit).execute()
        rows = result.data or []
        if role in ("designer", "admin"):
            return []
        return [_mechanic_row(r) for r in rows]
    rows = result.data or []
    return [_mechanic_row(r) for r in rows]


@router.get("/workload")
def mechanic_workload():
    db = get_supabase()
    try:
        people = fetch_all(
            lambda: db.table("mechanics").select(
                "id, name, role, active, labor_efficiency, salary_base, salary_period"
            ).eq("active", True)
        )
    except Exception:
        people = fetch_all(
            lambda: db.table("mechanics").select("id, name, role, active, salary_base, salary_period").eq("active", True)
        )
    orders = fetch_all(
        lambda: db.table("work_orders").select(
            "id, ot_number, status, mechanic, designer, work_description, price_charged, total_amount, entry_date, estimated_delivery_date, updated_at, clients(name)"
        )
    )
    try:
        items = fetch_all(
            lambda: db.table("order_items").select(
                "id, work_order_id, mechanic, designer, part_name, description, amount, process"
            )
        )
    except Exception:
        items = fetch_all(lambda: db.table("order_items").select("work_order_id, mechanic, process"))
    source = {"people": people, "orders": orders, "items": items, "rates": read_rates(db)}
    today = today_bolivia()
    return {
        "people": build_workload(source, today),
        "unassigned": unassigned_orders(source),
        "open_orders": open_orders(source),
    }


@router.post("", response_model=MechanicResponse, status_code=201, response_model_exclude_unset=True)
def create_mechanic(body: MechanicCreate):
    db = get_supabase()
    payload = {"name": body.name.strip(), "role": body.role}
    if body.role == "admin":
        payload["salary_mode"] = "fixed"
    try:
        result = db.table("mechanics").insert(payload).execute()
    except Exception:
        payload.pop("salary_mode", None)
        try:
            result = db.table("mechanics").insert(payload).execute()
        except Exception:
            if body.role == "admin":
                raise HTTPException(
                    status_code=400,
                    detail="Falló. Reiniciá e intentá otra vez.",
                )
            if body.role != "mechanic":
                raise HTTPException(
                    status_code=400,
                    detail="Falló. Reiniciá e intentá otra vez.",
                )
            result = db.table("mechanics").insert({"name": body.name.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear integrante")
    row = result.data[0]
    return _mechanic_row(row)


@router.patch("/{mechanic_id}", response_model=MechanicResponse, response_model_exclude_unset=True)
def update_mechanic(mechanic_id: UUID, body: MechanicUpdate):
    db = get_supabase()
    data = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    if "name" in data:
        data["name"] = data["name"].strip()
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")
    previous_efficiency = None
    try:
        if "labor_efficiency" in data:
            current = (
                db.table("mechanics")
                .select("labor_efficiency")
                .eq("id", str(mechanic_id))
                .limit(1)
                .execute()
            )
            if current.data:
                previous_efficiency = current.data[0].get("labor_efficiency")
        result = db.table("mechanics").update(data).eq("id", str(mechanic_id)).execute()
    except Exception:
        salary_keys = {"salary_base", "salary_mode", "salary_period", "pay_day", "work_started_on"}
        if "work_started_on" in data:
            raise HTTPException(
                status_code=400,
                detail="Falló. Reiniciá e intentá otra vez.",
            )
        if salary_keys & set(data) or "labor_efficiency" in data:
            raise HTTPException(
                status_code=400,
                detail="Falló. Reiniciá e intentá otra vez.",
            )
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Mecánico no encontrado")
    saved = result.data[0]
    if "salary_base" in data:
        _keep_one_salary(db, saved)
    if previous_efficiency is not None and "labor_efficiency" in data:
        remember_change(db, {
            "kind": "efficiency",
            "mechanic_id": str(mechanic_id),
            "previous": previous_efficiency,
            "next": data["labor_efficiency"],
        })
    return _mechanic_row(saved)


@router.get("/{mechanic_id}/rate-history")
def efficiency_history(mechanic_id: UUID):
    return list_changes(get_supabase(), {"kind": "efficiency", "mechanic_id": str(mechanic_id)})


def _keep_one_salary(db, person: dict) -> None:
    name = str(person.get("name") or "").strip()
    key = name.lower()
    if not key:
        return
    rows = (
        db.table("mechanics")
        .select("id, name")
        .eq("active", True)
        .ilike("name", name)
        .execute()
    ).data or []
    for row in rows:
        if str(row.get("id")) == str(person.get("id")):
            continue
        if str(row.get("name") or "").strip().lower() != key:
            continue
        db.table("mechanics").update({"salary_base": 0}).eq("id", str(row["id"])).execute()
