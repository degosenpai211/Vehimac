from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.database import get_supabase
from app.schemas.work_order import (
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderStatus,
    WorkOrderUpdate,
)
from app.services.orders import on_order_entregado

router = APIRouter(prefix="/work-orders", tags=["Órdenes de trabajo"])


def _enrich_order(order: dict) -> dict:
    client = order.pop("clients", None)
    if client:
        order["client"] = {
            "id": client["id"],
            "name": client["name"],
            "phone": client.get("phone"),
            "whatsapp": client.get("whatsapp"),
        }
    else:
        order["client"] = None
    return order


@router.get("", response_model=list[WorkOrderResponse])
def list_work_orders(
    status: WorkOrderStatus | None = Query(None),
    client_id: UUID | None = Query(None),
    mechanic: str | None = Query(None),
    search: str | None = Query(None),
    entry_from: str | None = Query(None),
    entry_to: str | None = Query(None),
    delivery_from: str | None = Query(None),
    delivery_to: str | None = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    db = get_supabase()
    query = db.table("work_orders").select("*, clients(id, name, phone, whatsapp)")

    if status:
        query = query.eq("status", status.value)
    if client_id:
        query = query.eq("client_id", str(client_id))
    if mechanic:
        query = query.ilike("mechanic", f"%{mechanic}%")
    if search:
        query = query.or_(
            f"work_description.ilike.%{search}%,part_description.ilike.%{search}%,vehicle_type.ilike.%{search}%"
        )
    if entry_from:
        query = query.gte("entry_date", entry_from)
    if entry_to:
        query = query.lte("entry_date", entry_to)
    if delivery_from:
        query = query.gte("estimated_delivery_date", delivery_from)
    if delivery_to:
        query = query.lte("estimated_delivery_date", delivery_to)

    desc = sort_dir.lower() != "asc"
    sort_col = sort_by if sort_by in ("created_at", "updated_at", "entry_date", "estimated_delivery_date", "price_charged") else "created_at"
    query = query.order(sort_col, desc=desc).range(offset, offset + limit - 1)

    result = query.execute()
    return [_enrich_order(o) for o in (result.data or [])]


@router.get("/kanban")
def get_kanban_board():
    db = get_supabase()
    result = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .order("created_at", desc=True)
        .execute()
    )
    orders = [_enrich_order(o) for o in (result.data or [])]
    board = {"en_proceso": [], "terminado": [], "entregado": []}
    for order in orders:
        status = order.get("status", "en_proceso")
        if status == "finalizado":
            status = "entregado"
        if status in board:
            board[status].append(order)
    return board


@router.get("/{order_id}", response_model=WorkOrderResponse)
def get_work_order(order_id: UUID):
    db = get_supabase()
    result = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", str(order_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return _enrich_order(result.data[0])


@router.post("", response_model=WorkOrderResponse, status_code=201)
def create_work_order(order: WorkOrderCreate):
    db = get_supabase()
    data = order.model_dump(mode="json")
    if data.get("client_id"):
        data["client_id"] = str(data["client_id"])

    result = db.table("work_orders").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear orden")

    order_id = result.data[0]["id"]
    full = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", order_id)
        .execute()
    )
    return _enrich_order(full.data[0])


@router.patch("/{order_id}", response_model=WorkOrderResponse)
def update_work_order(order_id: UUID, order: WorkOrderUpdate):
    db = get_supabase()
    old_res = db.table("work_orders").select("status").eq("id", str(order_id)).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    old_status = old_res.data[0].get("status")

    data = {k: v for k, v in order.model_dump(mode="json").items() if v is not None}
    if "client_id" in data and data["client_id"]:
        data["client_id"] = str(data["client_id"])
    if not data:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    result = db.table("work_orders").update(data).eq("id", str(order_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    new_status = data.get("status", old_status)
    if new_status == "entregado" and old_status != "entregado":
        on_order_entregado(order_id)

    full = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", str(order_id))
        .execute()
    )
    return _enrich_order(full.data[0])


@router.patch("/{order_id}/status", response_model=WorkOrderResponse)
def update_status(order_id: UUID, status: WorkOrderStatus):
    db = get_supabase()
    old_res = db.table("work_orders").select("status").eq("id", str(order_id)).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    old_status = old_res.data[0].get("status")

    result = (
        db.table("work_orders")
        .update({"status": status.value})
        .eq("id", str(order_id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if status == WorkOrderStatus.entregado and old_status != "entregado":
        on_order_entregado(order_id)

    full = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", str(order_id))
        .execute()
    )
    return _enrich_order(full.data[0])


@router.delete("/{order_id}", status_code=204)
def delete_work_order(order_id: UUID):
    db = get_supabase()
    result = db.table("work_orders").delete().eq("id", str(order_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
