from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_supabase
from app.schemas.mechanic import MechanicCreate, MechanicResponse, MechanicUpdate

router = APIRouter(prefix="/mechanics", tags=["Mecánicos"])


@router.get("", response_model=list[MechanicResponse])
def list_mechanics(
    search: str | None = Query(None),
    prefix: bool = Query(False),
    active_only: bool = Query(True),
    limit: int = Query(50, ge=1, le=200),
):
    db = get_supabase()
    query = db.table("mechanics").select("*").order("name")
    if active_only:
        query = query.eq("active", True)
    if search:
        pattern = f"{search}%" if prefix else f"%{search}%"
        query = query.ilike("name", pattern)
    result = query.limit(limit).execute()
    return result.data or []


@router.post("", response_model=MechanicResponse, status_code=201)
def create_mechanic(body: MechanicCreate):
    db = get_supabase()
    result = db.table("mechanics").insert({"name": body.name.strip()}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear mecánico")
    return result.data[0]


@router.patch("/{mechanic_id}", response_model=MechanicResponse)
def update_mechanic(mechanic_id: UUID, body: MechanicUpdate):
    db = get_supabase()
    data = {k: v for k, v in body.model_dump(mode="json").items() if v is not None}
    if "name" in data:
        data["name"] = data["name"].strip()
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")
    result = db.table("mechanics").update(data).eq("id", str(mechanic_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Mecánico no encontrado")
    return result.data[0]
