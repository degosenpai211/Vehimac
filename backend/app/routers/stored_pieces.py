from fastapi import APIRouter, Query

from app.database import get_supabase

router = APIRouter(prefix="/stored-pieces", tags=["Piezas guardadas"])


def _enrich(order: dict) -> dict:
    client = order.pop("clients", None)
    order["client"] = client
    return order


@router.get("")
def list_stored_pieces(
    search: str | None = Query(None),
    client_id: str | None = Query(None),
    entry_from: str | None = Query(None),
    entry_to: str | None = Query(None),
    sort_by: str = Query("updated_at"),
    sort_dir: str = Query("desc"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Órdenes en estado 'terminado' = piezas listas que el cliente no recogió."""
    db = get_supabase()
    query = (
        db.table("work_orders")
        .select("id, work_description, ot_number, client_id, vehicle_type, part_description, price_charged, entry_date, estimated_delivery_date, clients(id, name, phone, whatsapp)", count="exact")
        .eq("status", "terminado")
    )

    if client_id:
        query = query.eq("client_id", client_id)
    if search:
        query = query.or_(
            f"work_description.ilike.%{search}%,part_description.ilike.%{search}%,vehicle_type.ilike.%{search}%"
        )
    if entry_from:
        query = query.gte("entry_date", entry_from)
    if entry_to:
        query = query.lte("entry_date", entry_to)

    desc = sort_dir.lower() != "asc"
    sort_col = sort_by if sort_by in ("updated_at", "entry_date", "price_charged", "created_at") else "updated_at"
    query = query.order(sort_col, desc=desc).range(offset, offset + limit - 1)

    result = query.execute()
    return {
        "items": [_enrich(o) for o in (result.data or [])],
        "total": result.count or 0,
        "limit": limit,
        "offset": offset,
    }
