"""Fotos de órdenes de trabajo.

TEMPORAL: Supabase Storage, bucket `ot-photos`.
VPS: reemplazar este módulo por escritura en filesystem
     (ej. /var/www/vehimac/uploads/{order_id}/) y servir con Nginx.
     La tabla `order_photos` se conserva; solo cambia cómo se guarda y se lee `path`.
"""

from uuid import uuid4

from fastapi import HTTPException, UploadFile

BUCKET = "ot-photos"
MAX_PHOTOS = 3
MAX_BYTES = 5 * 1024 * 1024
ALLOWED = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _signed_url(db, storage_path: str) -> str | None:
    try:
        res = db.storage.from_(BUCKET).create_signed_url(storage_path, 3600)
    except Exception:
        return None
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return None


def count_photos(db, order_id: str) -> int:
    result = db.table("order_photos").select("id", count="exact").eq("work_order_id", order_id).execute()
    return result.count or len(result.data or [])


def photo_counts_by_order(db, order_ids: list[str]) -> dict[str, int]:
    counts = {oid: 0 for oid in order_ids}
    if not order_ids:
        return counts
    try:
        rows = db.table("order_photos").select("work_order_id").in_("work_order_id", order_ids).execute()
    except Exception:
        return counts
    for row in rows.data or []:
        oid = row.get("work_order_id")
        if oid in counts:
            counts[oid] += 1
        elif oid:
            counts[oid] = counts.get(oid, 0) + 1
    return counts


def list_photos(db, order_id: str) -> list[dict]:
    """Lazy: URLs firmadas solo cuando se abre el detalle."""
    rows = (
        db.table("order_photos")
        .select("*")
        .eq("work_order_id", order_id)
        .order("created_at")
        .execute()
    )
    out = []
    for row in rows.data or []:
        item = dict(row)
        item["url"] = _signed_url(db, row["path"])
        out.append(item)
    return out


def upload_photo(db, order_id: str, file: UploadFile) -> dict:
    if count_photos(db, order_id) >= MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Máximo {MAX_PHOTOS} fotos por OT")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Solo jpg, png o webp")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Máximo 5 MB por foto")

    ext = ALLOWED[content_type]
    storage_path = f"{order_id}/{uuid4().hex}.{ext}"

    # TEMPORAL — Supabase Storage
    # VPS: Path(UPLOAD_DIR, order_id).mkdir(); dest.write_bytes(data); path = str(dest)
    try:
        db.storage.from_(BUCKET).upload(
            storage_path,
            data,
            {"content-type": content_type, "upsert": "false"},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo subir la foto. ¿Existe el bucket ot-photos? ({exc})") from exc

    inserted = db.table("order_photos").insert({
        "work_order_id": order_id,
        "path": storage_path,
    }).execute()
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Foto subida pero no se registró en la base")
    row = dict(inserted.data[0])
    row["url"] = _signed_url(db, storage_path)
    return row


def delete_photo(db, order_id: str, photo_id: str) -> None:
    result = (
        db.table("order_photos")
        .select("*")
        .eq("id", photo_id)
        .eq("work_order_id", order_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    path = result.data[0]["path"]
    # TEMPORAL — borrar del bucket
    # VPS: Path(UPLOAD_DIR, path).unlink(missing_ok=True)
    try:
        db.storage.from_(BUCKET).remove([path])
    except Exception:
        pass
    db.table("order_photos").delete().eq("id", photo_id).execute()
