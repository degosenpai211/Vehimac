from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from decimal import Decimal

from app.database import fetch_all, fetch_in, get_supabase, in_parallel
from app.schemas.work_order import (
    BillingType,
    AdminHelpUpdate,
    CommissionPreview,
    OrderItemCreate,
    QrPaymentCreate,
    StepAssign,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderStatus,
    WorkOrderUpdate,
)
from app.services.billing import compute_billing, order_payable_total
from app.services.commission_sheet import commission_catalog, commission_figures, stamp_commission
from app.services.tariff import fixed_rates
from app.services.orders import _next_ot_number, on_order_entregado, register_advance, register_qr_payment
from app.services.photos import delete_photo, list_photos, photo_counts_by_order, upload_photo
from app.utils.dates import now_bolivia, today_bolivia
from app.utils.search import sanitize_search

router = APIRouter(prefix="/work-orders", tags=["Órdenes de trabajo"])

KANBAN_DELIVERED_DAYS = 30


def _apply_order_filters(
    db,
    query,
    *,
    search: str | None = None,
    client_id=None,
    status: str | None = None,
    entry_from: str | None = None,
    entry_to: str | None = None,
    delivery_from: str | None = None,
    delivery_to: str | None = None,
):
    if status:
        query = query.eq("status", status)
    if client_id:
        query = query.eq("client_id", str(client_id))
    if search:
        q = search.strip()
        if q.upper().startswith("OT") and q[2:].isdigit():
            query = query.eq("ot_number", int(q[2:]))
        else:
            safe = sanitize_search(q)
            if safe:
                or_parts = [
                    f"work_description.ilike.%{safe}%",
                    f"part_description.ilike.%{safe}%",
                ]
                try:
                    clients = (
                        db.table("clients")
                        .select("id")
                        .ilike("name", f"%{safe}%")
                        .limit(100)
                        .execute()
                    )
                    client_ids = [str(c["id"]) for c in (clients.data or [])]
                    if client_ids:
                        or_parts.append(f"client_id.in.({','.join(client_ids)})")
                except Exception:
                    pass
                query = query.or_(",".join(or_parts))
    if entry_from:
        query = query.gte("entry_date", entry_from)
    if entry_to:
        query = query.lte("entry_date", entry_to)
    if delivery_from:
        query = query.gte("estimated_delivery_date", delivery_from)
    if delivery_to:
        query = query.lte("estimated_delivery_date", delivery_to)
    return query


def _summary_from_pieces(pieces: list) -> dict:
    total = sum(Decimal(str(p.get("amount", 0) if isinstance(p, dict) else p.amount)) for p in pieces)
    first = pieces[0]
    if isinstance(first, dict):
        return {
            "work_description": first.get("description", "Orden"),
            "part_description": first.get("part_name"),
            "mechanic": first.get("mechanic"),
            "designer": first.get("designer"),
            "price_charged": float(total),
        }
    return {
        "work_description": first.description,
        "part_description": first.part_name,
        "mechanic": first.mechanic,
        "designer": first.designer,
        "price_charged": float(total),
    }


def _attach_pieces(db, order: dict) -> dict:
    _attach_pieces_many(db, [order])
    return order


def _attach_pieces_many(db, orders: list[dict]) -> list[dict]:
    if not orders:
        return orders
    ids = [o["id"] for o in orders]
    by_order = {oid: [] for oid in ids}
    for item in fetch_in(db, "order_items", "work_order_id", ids):
        if item.get("process") is None:
            item["process"] = {}
        by_order.setdefault(item["work_order_id"], []).append(item)
    for oid, items in by_order.items():
        items.sort(key=lambda x: x.get("sort_order") or 0)
    for order in orders:
        order["pieces"] = by_order.get(order["id"], [])
    return orders


def _attach_kanban_meta(db, orders: list[dict]) -> list[dict]:
    """Solo conteo de piezas y si el proceso está confirmado — sin JSONB completo."""
    if not orders:
        return orders
    ids = [o["id"] for o in orders]
    items = fetch_in(db, "order_items", "work_order_id", ids, "work_order_id, process")
    by_order: dict = {oid: [] for oid in ids}
    for item in items:
        by_order.setdefault(item["work_order_id"], []).append(item)
    for order in orders:
        pieces = by_order.get(order["id"], [])
        order["piece_count"] = len(pieces)
        order["process_done"] = bool(pieces) and all(
            isinstance(p.get("process"), dict) and p["process"].get("confirmed")
            for p in pieces
        )
        order["pieces"] = []
        order.setdefault("photo_count", 0)
    return orders


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
    order.setdefault("designer", None)
    order.setdefault("vehicle_label", None)
    return order


def _vehicle_label(row: dict | None) -> str | None:
    if not row:
        return None
    parts = [str(row.get(k) or "").strip() for k in ("make", "model")]
    label = " ".join(p for p in parts if p)
    return label or None


def _attach_vehicles(db, orders: list[dict]) -> list[dict]:
    if not orders:
        return orders
    client_ids = [o.get("client_id") for o in orders if o.get("client_id")]
    rows = fetch_in(db, "vehicles", "client_id", client_ids, "client_id, make, model, created_at")
    first: dict = {}
    for v in rows:
        cid = v.get("client_id")
        prev = first.get(cid)
        if not prev or str(v.get("created_at") or "") < str(prev.get("created_at") or ""):
            first[cid] = v
    for order in orders:
        order["vehicle_label"] = _vehicle_label(first.get(order.get("client_id")))
    return orders


def _matches_period(order: dict, period: str | None) -> bool:
    if not period or period == "all":
        return True
    today = today_bolivia()
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


def _staff(db) -> list:
    try:
        result = db.table("mechanics").select("name, role, labor_efficiency, salary_base, salary_period").eq("active", True).execute()
    except Exception:
        result = db.table("mechanics").select("name, role, salary_base, salary_period").eq("active", True).execute()
    return result.data or []


def _stamp_process(process, context: dict):
    if not isinstance(process, dict) or not process.get("commission"):
        return process
    stamped = dict(process)
    stamped["commission"] = stamp_commission(process.get("commission"), {
        "people": context["people"],
        "rates": context["rates"],
        "steps": process.get("steps") or [],
    })
    return stamped


def _insert_pieces(db, order_id: str, pieces: list[OrderItemCreate]) -> None:
    context = {"people": _staff(db), "rates": fixed_rates()}
    db.table("order_items").delete().eq("work_order_id", order_id).execute()
    for i, piece in enumerate(pieces):
        data = piece.model_dump(mode="json")
        data["work_order_id"] = order_id
        data["sort_order"] = i
        if data.get("process"):
            data["process"] = _stamp_process(data["process"], context)
        else:
            data.pop("process", None)
        try:
            db.table("order_items").insert(data).execute()
        except Exception:
            retry = dict(data)
            retry.pop("process", None)
            try:
                db.table("order_items").insert(retry).execute()
            except Exception:
                retry.pop("designer", None)
                db.table("order_items").insert(retry).execute()


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
    _attach_vehicles(db, [order])
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
    query = _apply_order_filters(
        db,
        query,
        search=search,
        client_id=client_id,
        status=status.value if status else None,
        entry_from=entry_from,
        entry_to=entry_to,
        delivery_from=delivery_from,
        delivery_to=delivery_to,
    )

    desc = sort_dir.lower() != "asc"
    sort_col = sort_by if sort_by in ("created_at", "updated_at", "entry_date", "estimated_delivery_date", "price_charged", "ot_number") else "created_at"
    query = query.order(sort_col, desc=desc).range(offset, offset + limit - 1)

    result = query.execute()
    orders = [_enrich_order(o) for o in (result.data or [])]
    _attach_pieces_many(db, orders)
    _attach_vehicles(db, orders)
    if orders:
        counts = photo_counts_by_order(db, [o["id"] for o in orders])
        for o in orders:
            o["photo_count"] = counts.get(o["id"], 0)
    if period:
        orders = [o for o in orders if _matches_period(o, period)]
    return orders


@router.get("/commission-pieces")
def list_commission_pieces():
    return commission_catalog()


@router.post("/commission-preview")
def preview_commission(body: CommissionPreview):
    db = get_supabase()
    figures = commission_figures(body.commission, {
        "people": _staff(db),
        "rates": fixed_rates(),
        "steps": body.steps,
    })
    return figures


PROCESS_IDS = ("diseno", "soldadura", "afinado", "pintura", "instalacion")
STEP_STATUSES = ("pendiente", "en_proceso", "completado")


def _clock_text(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) >= 16 and text[10:11] == "T" and text[4] == "-" and text[7] == "-":
        return text[:16]
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text
    raise HTTPException(status_code=400, detail="Faltan datos. Revisá lo que cargaste.")


def _steps_with(process: dict, assigned: StepAssign) -> list:
    by_id = {}
    for step in process.get("steps") or []:
        if isinstance(step, dict) and step.get("id"):
            by_id[step["id"]] = dict(step)
    status = assigned.status if assigned.status in STEP_STATUSES else None
    current = by_id.get(assigned.step_id) or {"id": assigned.step_id}
    current["technician"] = assigned.technician.strip() or None
    current["assigned_at"] = _clock_text(assigned.assigned_at) or None
    if status:
        current["status"] = status
    elif not current.get("status"):
        current["status"] = "en_proceso" if current["technician"] else "pendiente"
    if current.get("status") == "completado":
        current["completed_at"] = _clock_text(assigned.completed_at) or now_bolivia()
    else:
        current["completed_at"] = None
    by_id[assigned.step_id] = current
    return [by_id.get(step_id) or {"id": step_id, "status": "pendiente", "technician": None, "assigned_at": None} for step_id in PROCESS_IDS]


@router.patch("/{order_id}/pieces/{item_id}/step")
def assign_piece_step(order_id: UUID, item_id: UUID, body: StepAssign):
    if body.step_id not in PROCESS_IDS:
        raise HTTPException(status_code=400, detail="Faltan datos. Revisá lo que cargaste.")
    db = get_supabase()
    found = (
        db.table("order_items")
        .select("id, process, work_order_id")
        .eq("id", str(item_id))
        .eq("work_order_id", str(order_id))
        .limit(1)
        .execute()
    )
    if not found.data:
        raise HTTPException(status_code=404, detail="No se encontró la pieza.")
    process = found.data[0].get("process") or {}
    if not isinstance(process, dict):
        process = {}
    process = dict(process)
    process["steps"] = _steps_with(process, body)
    process = _stamp_process(process, {"people": _staff(db), "rates": fixed_rates()})
    saved = (
        db.table("order_items")
        .update({"process": process})
        .eq("id", str(item_id))
        .execute()
    )
    if not saved.data:
        raise HTTPException(status_code=400, detail="Falló. Reiniciá e intentá otra vez.")
    return {"ok": True}


@router.patch("/{order_id}/pieces/{item_id}/admin-help")
def mark_admin_help(order_id: UUID, item_id: UUID, body: AdminHelpUpdate):
    db = get_supabase()
    found = (
        db.table("order_items")
        .select("id, process, work_order_id")
        .eq("id", str(item_id))
        .eq("work_order_id", str(order_id))
        .limit(1)
        .execute()
    )
    if not found.data:
        raise HTTPException(status_code=404, detail="No se encontró la pieza.")
    process = found.data[0].get("process") or {}
    if not isinstance(process, dict):
        process = {}
    process = dict(process)
    commission = process.get("commission") if isinstance(process.get("commission"), dict) else {}
    commission = dict(commission)
    commission["admin_help"] = body.enabled
    process["commission"] = commission
    process = _stamp_process(process, {"people": _staff(db), "rates": fixed_rates()})
    saved = (
        db.table("order_items")
        .update({"process": process})
        .eq("id", str(item_id))
        .execute()
    )
    if not saved.data:
        raise HTTPException(status_code=400, detail="Falló. Reiniciá e intentá otra vez.")
    return {"ok": True, "admin_help": body.enabled}


@router.get("/kanban")
def get_kanban_board(
    period: str | None = Query(None, description="today | week | overdue | all | due_today | tomorrow | day_after | next_week"),
    search: str | None = Query(None),
    entry_from: str | None = Query(None),
    entry_to: str | None = Query(None),
    delivery_from: str | None = Query(None),
    delivery_to: str | None = Query(None),
):
    db = get_supabase()
    # Sin búsqueda ni filtros, las entregadas viejas no se traen: para verlas hay que buscarlas.
    unfiltered = not (search or entry_from or entry_to or delivery_from or delivery_to) and period in (None, "all")
    delivered_since = (today_bolivia() - timedelta(days=KANBAN_DELIVERED_DAYS)).isoformat()

    def board_orders():
        query = db.table("work_orders").select("*, clients(id, name, phone, whatsapp)").order("ot_number", desc=True)
        if unfiltered:
            query = query.or_(f"status.neq.entregado,updated_at.gte.{delivered_since}")
        return _apply_order_filters(
            db,
            query,
            search=search,
            entry_from=entry_from,
            entry_to=entry_to,
            delivery_from=delivery_from,
            delivery_to=delivery_to,
        )

    prepared = [_enrich_order(raw) for raw in fetch_all(board_orders)]
    filtered = [o for o in prepared if _matches_period(o, period)]
    if filtered:
        in_parallel(
            lambda: _attach_kanban_meta(db, filtered),
            lambda: _attach_vehicles(db, filtered),
        )
    board = {"en_proceso": [], "terminado": [], "entregado": []}
    for order in filtered:
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
        "designer": summary.get("designer"),
        "advance_amount": float(advance),
        "entry_date": today_bolivia().isoformat(),
        "estimated_delivery_date": order.estimated_delivery_date.isoformat() if order.estimated_delivery_date else None,
        "status": "en_proceso",
        **billing,
    }

    result = db.table("work_orders").insert(data).execute()
    if not result.data:
        data.pop("designer", None)
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
        payable = Decimal(str(data["total_amount"]))
        if not old.get("advance_recorded"):
            requested = order.advance_amount if order.advance_amount is not None else Decimal(str(old.get("advance_amount", 0)))
            data["advance_amount"] = float(_resolve_advance(payable, requested))
        # Recién después de validar el adelanto: un 400 no debe dejar piezas nuevas con el precio viejo.
        _insert_pieces(db, oid, order.pieces)
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
