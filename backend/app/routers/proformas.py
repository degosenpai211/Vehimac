from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.database import fetch_in, get_supabase
from app.routers.work_orders import (
    _billing_fields,
    _full_order,
    _insert_pieces,
    _resolve_advance,
    _summary_from_pieces,
)
from app.schemas.proforma import (
    ProformaConvert,
    ProformaCreate,
    ProformaItemCreate,
    ProformaResponse,
    ProformaStatus,
    ProformaUpdate,
)
from app.schemas.work_order import OrderItemCreate
from app.services.orders import _next_ot_number, register_advance
from app.services.proforma_pdf import delete_proforma_pdfs, upload_proforma_pdf
from app.utils.phone import normalize_bolivia_phone

router = APIRouter(prefix="/proformas", tags=["Proformas"])

PROSPECT_TTL_DAYS = 7
_PROSPECT_COLS = ("prospect_name", "prospect_phone", "prospect_expires_at")


def _next_pro_number(db) -> int:
    result = db.table("proformas").select("number").order("number", desc=True).limit(1).execute()
    if result.data and result.data[0].get("number"):
        return int(result.data[0]["number"]) + 1
    return 1


def _enrich(proforma: dict) -> dict:
    client = proforma.pop("clients", None)
    if client:
        proforma["client"] = {
            "id": client["id"],
            "name": client["name"],
            "phone": client.get("phone"),
            "whatsapp": client.get("whatsapp"),
        }
    else:
        proforma["client"] = None
    return proforma


def _attach_items(db, proforma: dict) -> dict:
    _attach_items_many(db, [proforma])
    return proforma


def _attach_items_many(db, rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    ids = [r["id"] for r in rows]
    by_id = {pid: [] for pid in ids}
    for item in fetch_in(db, "proforma_items", "proforma_id", ids):
        by_id.setdefault(item["proforma_id"], []).append(item)
    for pid, items in by_id.items():
        items.sort(key=lambda x: x.get("sort_order") or 0)
    for row in rows:
        row["pieces"] = by_id.get(row["id"], [])
    return rows


def _as_item(piece) -> ProformaItemCreate:
    if isinstance(piece, ProformaItemCreate):
        return piece
    amount = piece.get("amount") or 0
    unit = piece.get("unit_price")
    if unit is None or Decimal(str(unit)) == 0:
        unit = amount
    return ProformaItemCreate(
        description=piece.get("description") or "Trabajo",
        quantity=piece.get("quantity") or 1,
        unit_price=unit or 0,
        discount_percent=piece.get("discount_percent") or 0,
        part_name=piece.get("part_name"),
        mechanic=piece.get("mechanic"),
    )


def _item_row(item: ProformaItemCreate) -> dict:
    return {
        "part_name": item.part_name,
        "description": item.description,
        "quantity": float(item.quantity),
        "unit_price": float(item.unit_price),
        "discount_percent": float(item.discount_percent),
        "amount": float(item.amount),
        "mechanic": item.mechanic,
    }


def _insert_items(db, proforma_id: str, pieces: list) -> None:
    db.table("proforma_items").delete().eq("proforma_id", proforma_id).execute()
    for i, piece in enumerate(pieces):
        item = _as_item(piece)
        data = _item_row(item)
        data["proforma_id"] = proforma_id
        data["sort_order"] = i
        db.table("proforma_items").insert(data).execute()


def _full(db, proforma_id: str) -> dict:
    result = (
        db.table("proformas")
        .select("*, clients(id, name, phone, whatsapp)")
        .eq("id", proforma_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Proforma no encontrada")
    return _attach_items(db, _enrich(result.data[0]))


def _amounts(pieces) -> dict:
    items = [_as_item(p) for p in pieces]
    total = sum((item.amount or Decimal("0")) for item in items)
    first = items[0]
    return {
        "description": first.description,
        "billing_type": "sin_factura",
        "neto_amount": float(total),
        "iva_amount": 0,
        "total_amount": float(total),
    }


def _expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=PROSPECT_TTL_DAYS)).isoformat()


def _delete_proforma_cascade(db, pid: str) -> None:
    delete_proforma_pdfs(db, pid)
    db.table("proformas").delete().eq("id", pid).execute()


def _purge_expired_prospects(db) -> None:
    try:
        now = datetime.now(timezone.utc).isoformat()
        expired = (
            db.table("proformas")
            .select("id, status")
            .is_("client_id", "null")
            .lt("prospect_expires_at", now)
            .execute()
        )
    except Exception:
        return
    for row in expired.data or []:
        if row.get("status") == "convertida":
            continue
        _delete_proforma_cascade(db, row["id"])


def _promote_prospect(db, proforma: dict, *, status: str | None = "aprobada") -> str:
    cid = proforma.get("client_id")
    if cid:
        return str(cid)
    name = (proforma.get("prospect_name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Falta el nombre del interesado")
    phone = normalize_bolivia_phone(proforma.get("prospect_phone"))
    inserted = db.table("clients").insert({
        "name": name,
        "phone": phone,
        "whatsapp": phone,
    }).execute()
    if not inserted.data:
        raise HTTPException(status_code=500, detail="No se pudo crear el cliente")
    cid = inserted.data[0]["id"]
    payload = {
        "client_id": cid,
        "prospect_name": None,
        "prospect_phone": None,
        "prospect_expires_at": None,
    }
    if status:
        payload["status"] = status
    db.table("proformas").update(payload).eq("id", proforma["id"]).execute()
    return str(cid)


def _insert_proforma_row(db, data: dict):
    try:
        result = db.table("proformas").insert(data).execute()
    except Exception:
        if any(k in data for k in _PROSPECT_COLS) and not data.get("client_id"):
            raise HTTPException(
                status_code=400,
                detail="Falta correr migration_v14.sql en Supabase (columnas de prospecto)",
            )
        fallback = {k: v for k, v in data.items() if k not in _PROSPECT_COLS}
        result = db.table("proformas").insert(fallback).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear proforma")
    return result


def _update_proforma_row(db, pid: str, data: dict) -> None:
    try:
        db.table("proformas").update(data).eq("id", pid).execute()
    except Exception:
        if any(k in data for k in _PROSPECT_COLS):
            raise HTTPException(
                status_code=400,
                detail="Falta correr migration_v14.sql en Supabase (columnas de prospecto)",
            )
        raise


@router.get("", response_model=list[ProformaResponse])
def list_proformas(status: ProformaStatus | None = Query(None)):
    db = get_supabase()
    _purge_expired_prospects(db)
    query = db.table("proformas").select("*, clients(id, name, phone, whatsapp)").order("number", desc=True)
    if status:
        query = query.eq("status", status.value)
    result = query.execute()
    rows = [_enrich(row) for row in (result.data or [])]
    return _attach_items_many(db, rows)


@router.get("/{proforma_id}", response_model=ProformaResponse)
def get_proforma(proforma_id: UUID):
    return _full(get_supabase(), str(proforma_id))


@router.post("/{proforma_id}/pdf")
def share_proforma_pdf(proforma_id: UUID, file: UploadFile = File(...)):
    db = get_supabase()
    _full(db, str(proforma_id))
    return upload_proforma_pdf(db, str(proforma_id), file)


@router.post("", response_model=ProformaResponse, status_code=201)
def create_proforma(body: ProformaCreate):
    db = get_supabase()
    _purge_expired_prospects(db)
    amounts = _amounts(body.pieces)
    data = {
        "number": _next_pro_number(db),
        "client_id": str(body.client_id) if body.client_id else None,
        "notes": body.notes,
        "status": "pendiente",
        **amounts,
    }
    if body.client_id:
        data["prospect_name"] = None
        data["prospect_phone"] = None
        data["prospect_expires_at"] = None
    else:
        data["prospect_name"] = (body.prospect_name or "").strip() or None
        data["prospect_phone"] = normalize_bolivia_phone(body.prospect_phone)
        data["prospect_expires_at"] = _expires_at()
    result = _insert_proforma_row(db, data)
    pid = result.data[0]["id"]
    _insert_items(db, pid, body.pieces)
    return _full(db, pid)


@router.patch("/{proforma_id}", response_model=ProformaResponse)
def update_proforma(proforma_id: UUID, body: ProformaUpdate):
    db = get_supabase()
    pid = str(proforma_id)
    old = _full(db, pid)
    if old.get("status") == "convertida":
        raise HTTPException(status_code=400, detail="No se puede editar una proforma ya convertida a OT")

    data = {}
    if body.client_id:
        data["client_id"] = str(body.client_id)
        data["prospect_name"] = None
        data["prospect_phone"] = None
        data["prospect_expires_at"] = None
    elif body.prospect_name is not None:
        name = (body.prospect_name or "").strip()
        if not name and not old.get("client_id"):
            raise HTTPException(
                status_code=400,
                detail="Indicá un cliente de la ficha o el nombre del interesado",
            )
        if name:
            data["client_id"] = None
            data["prospect_name"] = name
            if body.prospect_phone is not None:
                data["prospect_phone"] = normalize_bolivia_phone(body.prospect_phone)
            if not old.get("prospect_expires_at"):
                data["prospect_expires_at"] = _expires_at()
    elif body.prospect_phone is not None and not old.get("client_id"):
        data["prospect_phone"] = normalize_bolivia_phone(body.prospect_phone)
    if body.notes is not None:
        data["notes"] = body.notes
    if body.status is not None:
        data["status"] = body.status.value
    if body.pieces:
        _insert_items(db, pid, body.pieces)
        data.update(_amounts(body.pieces))

    if data:
        _update_proforma_row(db, pid, data)
    return _full(db, pid)


@router.post("/{proforma_id}/convert", response_model=dict)
def convert_proforma(proforma_id: UUID, body: ProformaConvert):
    db = get_supabase()
    pid = str(proforma_id)
    proforma = _full(db, pid)
    status = proforma.get("status")
    if status == "convertida":
        raise HTTPException(status_code=400, detail="Esta proforma ya es una OT")

    client_id = _promote_prospect(db, proforma, status=None)
    proforma = _full(db, pid)

    pieces_raw = proforma.get("pieces") or []
    if not pieces_raw:
        raise HTTPException(status_code=400, detail="La proforma no tiene líneas")
    pieces = []
    for p in pieces_raw:
        name = (p.get("part_name") or p.get("description") or "").strip() or "Pieza"
        work = (p.get("description") or "").strip()
        if not p.get("part_name"):
            work = name
        pieces.append(
            OrderItemCreate(
                part_name=name,
                description=work or name,
                amount=Decimal(str(p.get("amount") or 0)),
                mechanic=p.get("mechanic"),
            )
        )
    summary = _summary_from_pieces(pieces)
    billing = _billing_fields(Decimal(str(summary["price_charged"])), "sin_factura")
    payable = Decimal(str(billing["total_amount"]))
    advance = _resolve_advance(payable, body.advance_amount)

    order_data = {
        "client_id": client_id,
        "ot_number": _next_ot_number(db),
        "work_description": summary["work_description"],
        "part_description": summary["part_description"],
        "mechanic": summary["mechanic"],
        "advance_amount": float(advance),
        "status": "en_proceso",
        **billing,
    }
    result = db.table("work_orders").insert(order_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear la OT")
    oid = result.data[0]["id"]
    _insert_pieces(db, oid, pieces)

    if body.register_advance and advance > 0:
        register_advance(UUID(oid))

    db.table("proformas").update({
        "status": "convertida",
        "work_order_id": oid,
    }).eq("id", pid).execute()

    return {
        "proforma": _full(db, pid),
        "order": _full_order(db, oid),
    }


@router.post("/{proforma_id}/accept", response_model=ProformaResponse)
def accept_proforma(proforma_id: UUID):
    db = get_supabase()
    pid = str(proforma_id)
    proforma = _full(db, pid)
    if proforma.get("status") == "convertida":
        raise HTTPException(status_code=400, detail="Esta proforma ya es una OT")
    _promote_prospect(db, proforma, status="aprobada")
    return _full(db, pid)


@router.delete("/{proforma_id}", status_code=204)
def delete_proforma(proforma_id: UUID):
    db = get_supabase()
    pid = str(proforma_id)
    old = _full(db, pid)
    if old.get("status") == "convertida":
        raise HTTPException(status_code=400, detail="No se puede eliminar una proforma convertida")
    _delete_proforma_cascade(db, pid)
