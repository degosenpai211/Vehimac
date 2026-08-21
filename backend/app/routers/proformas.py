from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from decimal import Decimal

from app.database import get_supabase
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
    ProformaResponse,
    ProformaStatus,
    ProformaUpdate,
)
from app.schemas.work_order import OrderItemCreate
from app.services.orders import _next_ot_number, register_advance

router = APIRouter(prefix="/proformas", tags=["Proformas"])


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
    items = (
        db.table("proforma_items")
        .select("*")
        .eq("proforma_id", proforma["id"])
        .order("sort_order")
        .execute()
    )
    proforma["pieces"] = items.data or []
    return proforma


def _insert_items(db, proforma_id: str, pieces: list[OrderItemCreate]) -> None:
    db.table("proforma_items").delete().eq("proforma_id", proforma_id).execute()
    for i, piece in enumerate(pieces):
        data = piece.model_dump(mode="json")
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


def _amounts(pieces, billing_type: str) -> dict:
    summary = _summary_from_pieces(pieces)
    neto = Decimal(str(summary["price_charged"]))
    billing = _billing_fields(neto, billing_type)
    return {
        "description": summary["work_description"],
        "billing_type": billing_type,
        "neto_amount": billing["price_charged"],
        "iva_amount": billing["iva_amount"],
        "total_amount": billing["total_amount"],
    }


@router.get("", response_model=list[ProformaResponse])
def list_proformas(status: ProformaStatus | None = Query(None)):
    db = get_supabase()
    query = db.table("proformas").select("*, clients(id, name, phone, whatsapp)").order("number", desc=True)
    if status:
        query = query.eq("status", status.value)
    result = query.execute()
    return [_attach_items(db, _enrich(row)) for row in (result.data or [])]


@router.get("/{proforma_id}", response_model=ProformaResponse)
def get_proforma(proforma_id: UUID):
    return _full(get_supabase(), str(proforma_id))


@router.post("", response_model=ProformaResponse, status_code=201)
def create_proforma(body: ProformaCreate):
    db = get_supabase()
    amounts = _amounts(body.pieces, body.billing_type.value)
    data = {
        "number": _next_pro_number(db),
        "client_id": str(body.client_id) if body.client_id else None,
        "notes": body.notes,
        "status": "pendiente",
        **amounts,
    }
    result = db.table("proformas").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear proforma")
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
    if body.client_id is not None:
        data["client_id"] = str(body.client_id) if body.client_id else None
    if body.notes is not None:
        data["notes"] = body.notes
    if body.status is not None:
        if old.get("status") == "convertida":
            raise HTTPException(status_code=400, detail="La proforma ya fue convertida")
        data["status"] = body.status.value

    billing_type = body.billing_type.value if body.billing_type else old.get("billing_type") or "sin_factura"
    if body.pieces:
        _insert_items(db, pid, body.pieces)
        data.update(_amounts(body.pieces, billing_type))
    elif body.billing_type is not None:
        pieces = old.get("pieces") or []
        if pieces:
            mapped = [OrderItemCreate(**{k: p.get(k) for k in ("part_name", "description", "amount", "mechanic")}) for p in pieces]
            data.update(_amounts(mapped, billing_type))

    if data:
        db.table("proformas").update(data).eq("id", pid).execute()
    return _full(db, pid)


@router.post("/{proforma_id}/convert", response_model=dict)
def convert_proforma(proforma_id: UUID, body: ProformaConvert):
    db = get_supabase()
    pid = str(proforma_id)
    proforma = _full(db, pid)
    status = proforma.get("status")
    if status == "convertida":
        raise HTTPException(status_code=400, detail="Esta proforma ya es una OT")
    if status == "rechazada":
        raise HTTPException(status_code=400, detail="No se puede convertir una proforma rechazada")

    pieces_raw = proforma.get("pieces") or []
    if not pieces_raw:
        raise HTTPException(status_code=400, detail="La proforma no tiene piezas")
    pieces = [
        OrderItemCreate(
            part_name=p.get("part_name"),
            description=p.get("description") or "Trabajo",
            amount=Decimal(str(p.get("amount") or 0)),
            mechanic=p.get("mechanic"),
        )
        for p in pieces_raw
    ]
    summary = _summary_from_pieces(pieces)
    billing_type = proforma.get("billing_type") or "sin_factura"
    billing = _billing_fields(Decimal(str(summary["price_charged"])), billing_type)
    payable = Decimal(str(billing["total_amount"]))
    advance = _resolve_advance(payable, body.advance_amount)

    order_data = {
        "client_id": proforma.get("client_id"),
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


@router.delete("/{proforma_id}", status_code=204)
def delete_proforma(proforma_id: UUID):
    db = get_supabase()
    pid = str(proforma_id)
    old = _full(db, pid)
    if old.get("status") == "convertida":
        raise HTTPException(status_code=400, detail="No se puede eliminar una proforma convertida")
    db.table("proformas").delete().eq("id", pid).execute()
