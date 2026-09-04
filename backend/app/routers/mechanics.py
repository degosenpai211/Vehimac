from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_supabase
from app.schemas.mechanic import MechanicCreate, MechanicResponse, MechanicUpdate

router = APIRouter(prefix="/mechanics", tags=["Mecánicos"])


def _mechanic_row(row: dict) -> dict:
    row.setdefault("role", "mechanic")
    row.setdefault("salary_base", 0)
    row.setdefault("salary_mode", "both")
    row.setdefault("salary_period", "monthly")
    row.setdefault("pay_day", 30)
    return row


@router.get("", response_model=list[MechanicResponse])
def list_mechanics(
    search: str | None = Query(None),
    prefix: bool = Query(False),
    active_only: bool = Query(True),
    role: str | None = Query(None, description="mechanic | designer"),
    limit: int = Query(50, ge=1, le=200),
):
    db = get_supabase()
    query = db.table("mechanics").select("*").order("name")
    if active_only:
        query = query.eq("active", True)
    if role in ("mechanic", "designer"):
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
        if role == "designer":
            return []
        return [_mechanic_row(r) for r in rows]
    rows = result.data or []
    return [_mechanic_row(r) for r in rows]


@router.post("", response_model=MechanicResponse, status_code=201)
def create_mechanic(body: MechanicCreate):
    db = get_supabase()
    payload = {"name": body.name.strip(), "role": body.role}
    try:
        result = db.table("mechanics").insert(payload).execute()
    except Exception:
        if body.role != "mechanic":
            raise HTTPException(
                status_code=400,
                detail="Falta la columna de rol. Ejecutá migration_v10.sql en Supabase.",
            )
        result = db.table("mechanics").insert({"name": body.name.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear integrante")
    row = result.data[0]
    return _mechanic_row(row)


@router.patch("/{mechanic_id}", response_model=MechanicResponse)
def update_mechanic(mechanic_id: UUID, body: MechanicUpdate):
    db = get_supabase()
    data = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    if "name" in data:
        data["name"] = data["name"].strip()
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")
    try:
        result = db.table("mechanics").update(data).eq("id", str(mechanic_id)).execute()
    except Exception:
        salary_keys = {"salary_base", "salary_mode", "salary_period", "pay_day"}
        if salary_keys & set(data):
            raise HTTPException(
                status_code=400,
                detail="Faltan columnas de salario. Ejecutá migration_v12.sql en Supabase.",
            )
        raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Mecánico no encontrado")
    return _mechanic_row(result.data[0])
