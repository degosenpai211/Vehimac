from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from decimal import Decimal

from app.database import get_supabase
from app.schemas.work_order import (
    BillingType,
    OrderItemCreate,
    QrPaymentCreate,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderStatus,
    WorkOrderUpdate,
)
from app.services.billing import compute_billing, order_payable_total
from app.services.orders import _next_ot_number, on_order_entregado, register_advance, register_qr_payment
from app.services.photos import delete_photo, list_photos, photo_counts_by_order, upload_photo

router = APIRouter(prefix="/work-orders", tags=["Órdenes de trabajo"])


def _summary_from_pieces(pieces: list) -> dict:
    total = sum(Decimal(str(p.get("amount", 0) if isinstance(p, dict) else p.amount)) for p in pieces)
    first = pieces[0]
    if isinstance(first, dict):
        return {
            "work_description": first.get("description", "Orden"),
            "part_description": first.get("part_name"),
            "mechanic": first.get("mechanic"),
            "price_charged": float(total),
        }
    return {
        "work_description": first.description,
        "part_description": first.part_name,
        "mechanic": first.mechanic,
        "price_charged": float(total),
    }


def _attach_pieces(db, order: dict) -> dict:
    items = (
        db.table("order_items")
        .select("*")
        .eq("work_order_id", order["id"])
        .order("sort_order")
        .execute()
    )
    order["pieces"] = items.data or []
    return order


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
    if not order.get("billing_type"):
        order["billing_type"] = "sin_factura"
    if not order.get("iva_amount"):
        order["iva_amount"] = 0
    if not order.get("total_amount"):
        order["total_amount"] = order.get("price_charged") or 0
    order.setdefault("qr_paid", False)
    order.setdefault("qr_paid_amount", 0)
    order.setdefault("photo_count", 0)
    return order


def _matches_period(order: dict, period: str | None) -> bool:
    if not period or period == "all":
        return True
    today = date.today()
    entry = order.get("entry_date")
    delivery = order.get("estimated_delivery_date")
    if isinstance(entry, str):
        entry = date.fromisoformat(entry[:10]) if entry else None
    if isinstance(delivery, str):
        delivery = date.fromisoformat(delivery[:10]) if delivery else None

    if period == "today":
        if delivery == today:
            return True
        if entry and delivery:
            return entry <= today <= delivery
        return entry == today
    if period == "week":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        if delivery and start <= delivery <= end:
            return True
        if entry and start <= entry <= end:
            return True
        if entry and delivery:
            return entry <= end and delivery >= start
        return False
    if period == "overdue":
        if order.get("status") == "entregado":
            return False
        return bool(delivery and delivery < today)
    # Agenda por fecha de entrega (no reemplaza Hoy / semana / atrasadas)
    if period in ("due_today", "tomorrow", "day_after", "next_week"):
        if order.get("status") == "entregado" or not delivery:
            return False
        if period == "due_today":
            return delivery == today
        if period == "tomorrow":
            return delivery == today + timedelta(days=1)
        if period == "day_after":
            return delivery == today + timedelta(days=2)
        next_mon = today + timedelta(days=(7 - today.weekday()) or 7)
        return next_mon <= delivery <= next_mon + timedelta(days=6)
    return True


def _billing_fields(neto: Decimal, billing_type: str) -> dict:
    iva, total = compute_billing(neto, billing_type)
    return {
        "price_charged": float(neto),
        "billing_type": billing_type,
        "iva_amount": float(iva),
        "total_amount": float(total),
    }


def _resolve_advance(total: Decimal, requested: Decimal | None) -> Decimal:
    if requested is not None:
        advance = requested.quantize(Decimal("0.01"))
        if advance > total:
            raise HTTPException(status_code=400, detail="El adelanto no puede superar el monto total")
        return advance
    return (total / 2).quantize(Decimal("0.01")) if total > 0 else Decimal("0")


def _insert_pieces(db, order_id: str, pieces: list[OrderItemCreate]) -> None:
    db.table("order_items").delete().eq("work_order_id", order_id).execute()
    for i, piece in enumerate(pieces):
        data = piece.model_dump(mode="json")
        data["work_order_id"] = order_id
        data["sort_order"] = i
        db.table("order_items").insert(data).execute()


def _full_order(db, order_id: str) -> dict:
    result = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", order_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    order = _enrich_order(result.data[0])
    return _attach_pieces(db, order)


@router.get("", response_model=list[WorkOrderResponse])
def list_work_orders(
    status: WorkOrderStatus | None = Query(None),
    client_id: UUID | None = Query(None),
    search: str | None = Query(None),
    entry_from: str | None = Query(None),
    entry_to: str | None = Query(None),
    delivery_from: str | None = Query(None),
    delivery_to: str | None = Query(None),
    period: str | None = Query(None, description="today | week | overdue | all | due_today | tomorrow | day_after | next_week"),
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
    if search:
        if search.upper().startswith("OT") and search[2:].isdigit():
            query = query.eq("ot_number", int(search[2:]))
        else:
            query = query.or_(
                f"work_description.ilike.%{search}%,part_description.ilike.%{search}%"
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
    sort_col = sort_by if sort_by in ("created_at", "updated_at", "entry_date", "estimated_delivery_date", "price_charged", "ot_number") else "created_at"
    query = query.order(sort_col, desc=desc).range(offset, offset + limit - 1)

    result = query.execute()
    orders = []
    for o in result.data or []:
        order = _enrich_order(o)
        orders.append(_attach_pieces(db, order))
    if orders:
        counts = photo_counts_by_order(db, [o["id"] for o in orders])
        for o in orders:
            o["photo_count"] = counts.get(o["id"], 0)
    if period:
        orders = [o for o in orders if _matches_period(o, period)]
    return orders


@router.get("/kanban")
def get_kanban_board(period: str | None = Query(None, description="today | week | overdue | all | due_today | tomorrow | day_after | next_week")):
    db = get_supabase()
    result = (
        db.table("work_orders")
        .select("*, clients(id, name, phone, whatsapp)")
        .order("ot_number", desc=True)
        .execute()
    )
    board = {"en_proceso": [], "terminado": [], "entregado": []}
    prepared = []
    for raw in result.data or []:
        order = _attach_pieces(db, _enrich_order(raw))
        if not _matches_period(order, period):
            continue
        prepared.append(order)
    counts = photo_counts_by_order(db, [o["id"] for o in prepared])
    for order in prepared:
        order["photo_count"] = counts.get(order["id"], 0)
        status = order.get("status", "en_proceso")
        if status == "finalizado":
            status = "entregado"
        if status in board:
            board[status].append(order)
    return board


@router.get("/{order_id}/photos")
def get_order_photos(order_id: UUID):
    """URLs firmadas. Llamar solo al abrir el detalle (lazy)."""
    db = get_supabase()
    check = db.table("work_orders").select("id").eq("id", str(order_id)).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return list_photos(db, str(order_id))


@router.post("/{order_id}/photos", status_code=201)
def add_order_photo(order_id: UUID, file: UploadFile = File(...)):
    db = get_supabase()
    check = db.table("work_orders").select("id").eq("id", str(order_id)).execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return upload_photo(db, str(order_id), file)


@router.delete("/{order_id}/photos/{photo_id}", status_code=204)
def remove_order_photo(order_id: UUID, photo_id: UUID):
    delete_photo(get_supabase(), str(order_id), str(photo_id))


@router.get("/{order_id}", response_model=WorkOrderResponse)
def get_work_order(order_id: UUID):
    return _full_order(get_supabase(), str(order_id))


@router.post("", response_model=WorkOrderResponse, status_code=201)
def create_work_order(order: WorkOrderCreate):
    db = get_supabase()
    summary = _summary_from_pieces(order.pieces)
    ot_number = _next_ot_number(db)
    neto = Decimal(str(summary["price_charged"]))
    billing = _billing_fields(neto, order.billing_type.value)
    payable = Decimal(str(billing["total_amount"]))
    advance = _resolve_advance(payable, order.advance_amount)

    data = {
        "client_id": str(order.client_id) if order.client_id else None,
        "ot_number": ot_number,
        "work_description": summary["work_description"],
        "part_description": summary["part_description"],
        "mechanic": summary["mechanic"],
        "advance_amount": float(advance),
        "estimated_delivery_date": order.estimated_delivery_date.isoformat() if order.estimated_delivery_date else None,
        "status": "en_proceso",
        **billing,
    }

    result = db.table("work_orders").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear orden")

    order_id = result.data[0]["id"]
    _insert_pieces(db, order_id, order.pieces)

    if order.register_advance and advance > 0:
        register_advance(UUID(order_id))

    return _full_order(db, order_id)


@router.patch("/{order_id}", response_model=WorkOrderResponse)
def update_work_order(order_id: UUID, order: WorkOrderUpdate):
    db = get_supabase()
    oid = str(order_id)
    old_res = db.table("work_orders").select("*").eq("id", oid).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    old = old_res.data[0]
    old_status = old.get("status")

    data = {}
    if order.client_id is not None:
        data["client_id"] = str(order.client_id) if order.client_id else None
    if order.estimated_delivery_date is not None:
        data["estimated_delivery_date"] = order.estimated_delivery_date.isoformat()
    if order.status is not None:
        data["status"] = order.status.value

    if order.billing_type is not None and not old.get("delivery_payment_recorded"):
        billing_type = order.billing_type.value
    else:
        billing_type = old.get("billing_type") or "sin_factura"

    if order.pieces:
        summary = _summary_from_pieces(order.pieces)
        neto = Decimal(str(summary["price_charged"]))
        data.update({k: v for k, v in summary.items() if k != "price_charged"})
        data.update(_billing_fields(neto, billing_type))
        _insert_pieces(db, oid, order.pieces)
        payable = Decimal(str(data["total_amount"]))
        if not old.get("advance_recorded"):
            requested = order.advance_amount if order.advance_amount is not None else Decimal(str(old.get("advance_amount", 0)))
            data["advance_amount"] = float(_resolve_advance(payable, requested))
    else:
        if order.billing_type is not None and not old.get("delivery_payment_recorded"):
            neto = Decimal(str(old.get("price_charged", 0)))
            data.update(_billing_fields(neto, billing_type))
        if order.advance_amount is not None and not old.get("advance_recorded"):
            payable = order_payable_total({**old, **data})
            data["advance_amount"] = float(_resolve_advance(payable, order.advance_amount))

    if data:
        db.table("work_orders").update(data).eq("id", oid).execute()

    if order.register_advance:
        register_advance(order_id)

    new_status = data.get("status", old_status)
    if new_status == "entregado" and old_status != "entregado":
        on_order_entregado(order_id)

    return _full_order(db, oid)


@router.patch("/{order_id}/status", response_model=WorkOrderResponse)
def update_status(order_id: UUID, status: WorkOrderStatus):
    db = get_supabase()
    oid = str(order_id)
    old_res = db.table("work_orders").select("status").eq("id", oid).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    old_status = old_res.data[0].get("status")

    db.table("work_orders").update({"status": status.value}).eq("id", oid).execute()

    if status == WorkOrderStatus.entregado and old_status != "entregado":
        on_order_entregado(order_id)

    return _full_order(db, oid)


@router.post("/{order_id}/qr-payment", response_model=WorkOrderResponse)
def confirm_qr_payment(order_id: UUID, body: QrPaymentCreate):
    register_qr_payment(order_id, body.bank, body.amount)
    return _full_order(get_supabase(), str(order_id))


@router.post("/{order_id}/advance", response_model=WorkOrderResponse)
def record_advance(order_id: UUID):
    register_advance(order_id, force=False)
    return _full_order(get_supabase(), str(order_id))


@router.delete("/{order_id}", status_code=204)
def delete_work_order(order_id: UUID):
    db = get_supabase()
    result = db.table("work_orders").delete().eq("id", str(order_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
