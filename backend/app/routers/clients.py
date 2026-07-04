from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_supabase
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate, VehicleCreate, VehicleResponse
from app.utils.phone import normalize_bolivia_phone

router = APIRouter(prefix="/clients", tags=["Clientes"])


def _enrich_clients_batch(db, clients: list[dict]) -> list[dict]:
    if not clients:
        return []

    client_ids = [c["id"] for c in clients]

    vehicles_result = db.table("vehicles").select("*").in_("client_id", client_ids).execute()
    vehicles_by_client: dict[str, list] = {cid: [] for cid in client_ids}
    for v in vehicles_result.data or []:
        vehicles_by_client.setdefault(v["client_id"], []).append(v)

    orders_result = (
        db.table("work_orders")
        .select("id, client_id, ot_number, work_description, status, price_charged, entry_date, created_at")
        .in_("client_id", client_ids)
        .order("created_at", desc=True)
        .execute()
    )
    orders_by_client: dict[str, list] = {cid: [] for cid in client_ids}
    stored_count: dict[str, int] = {cid: 0 for cid in client_ids}
    for o in orders_result.data or []:
        cid = o.get("client_id")
        if cid in orders_by_client:
            orders_by_client[cid].append(o)
            if o.get("status") == "terminado":
                stored_count[cid] = stored_count.get(cid, 0) + 1

    for client in clients:
        cid = client["id"]
        autos = vehicles_by_client.get(cid, [])
        client["vehicles"] = autos
        client["autos"] = autos
        client["work_orders"] = orders_by_client.get(cid, [])
        client["stored_pieces_count"] = stored_count.get(cid, 0)

    return clients


def _normalize_client_phones(data: dict) -> dict:
    if data.get("phone"):
        data["phone"] = normalize_bolivia_phone(data["phone"])
    if data.get("whatsapp"):
        data["whatsapp"] = normalize_bolivia_phone(data["whatsapp"])
    elif data.get("phone"):
        data["whatsapp"] = data["phone"]
    return data


@router.get("")
def list_clients(
    search: str | None = Query(None),
    prefix: bool = Query(False, description="Buscar nombres que empiezan con el texto"),
    has_stored_pieces: bool | None = Query(None),
    sort_by: str = Query("name"),
    sort_dir: str = Query("asc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    db = get_supabase()
    query = db.table("clients").select("*", count="exact")

    if search:
        if prefix:
            query = query.ilike("name", f"{search}%")
        else:
            query = query.or_(f"name.ilike.%{search}%,phone.ilike.%{search}%,whatsapp.ilike.%{search}%")

    desc = sort_dir.lower() == "desc"
    sort_col = sort_by if sort_by in ("name", "created_at", "updated_at", "balance_updated_at") else "name"
    query = query.order(sort_col, desc=desc).range(offset, offset + limit - 1)

    result = query.execute()
    clients = _enrich_clients_batch(db, result.data or [])

    if has_stored_pieces is True:
        clients = [c for c in clients if c.get("stored_pieces_count", 0) > 0]
    elif has_stored_pieces is False:
        clients = [c for c in clients if c.get("stored_pieces_count", 0) == 0]

    return {
        "items": clients,
        "total": result.count or len(clients),
        "limit": limit,
        "offset": offset,
    }


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: UUID):
    db = get_supabase()
    result = db.table("clients").select("*").eq("id", str(client_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return _enrich_clients_batch(db, result.data)[0]


@router.post("", response_model=ClientResponse, status_code=201)
def create_client(client: ClientCreate):
    db = get_supabase()
    autos_data = client.autos or getattr(client, "vehicles", []) or []
    client_data = _normalize_client_phones(client.model_dump(exclude={"autos", "vehicles"}, mode="json"))

    result = db.table("clients").insert(client_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear cliente")

    new_client = result.data[0]
    for v in autos_data:
        v_data = v.model_dump(mode="json") if hasattr(v, "model_dump") else v
        v_data["client_id"] = new_client["id"]
        db.table("vehicles").insert(v_data).execute()

    return _enrich_clients_batch(db, [new_client])[0]


@router.patch("/{client_id}", response_model=ClientResponse)
def update_client(client_id: UUID, client: ClientUpdate):
    db = get_supabase()
    data = {k: v for k, v in client.model_dump(mode="json").items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    if "balance" in data or "payment_method" in data:
        from datetime import datetime, timezone
        data["balance_updated_at"] = datetime.now(timezone.utc).isoformat()

    data = _normalize_client_phones(data)

    result = db.table("clients").update(data).eq("id", str(client_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return _enrich_clients_batch(db, result.data)[0]


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: UUID):
    db = get_supabase()
    result = db.table("clients").delete().eq("id", str(client_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")


@router.post("/{client_id}/autos", response_model=VehicleResponse, status_code=201)
@router.post("/{client_id}/vehicles", response_model=VehicleResponse, status_code=201)
def add_vehicle(client_id: UUID, vehicle: VehicleCreate):
    db = get_supabase()
    check = db.table("clients").select("id").eq("id", str(client_id)).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    data = vehicle.model_dump(mode="json")
    data["client_id"] = str(client_id)
    result = db.table("vehicles").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al agregar vehículo")
    return result.data[0]


@router.delete("/{client_id}/vehicles/{vehicle_id}", status_code=204)
def delete_vehicle(client_id: UUID, vehicle_id: UUID):
    db = get_supabase()
    result = (
        db.table("vehicles")
        .delete()
        .eq("id", str(vehicle_id))
        .eq("client_id", str(client_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
