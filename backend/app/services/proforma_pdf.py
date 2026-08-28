"""PDF de proforma para enviar por WhatsApp (URL firmada).

TEMPORAL: Supabase Storage, bucket `proforma-pdfs`.
VPS: guardar en filesystem y devolver URL pública Nginx.
"""

from uuid import uuid4

from fastapi import HTTPException, UploadFile

BUCKET = "proforma-pdfs"
MAX_BYTES = 8 * 1024 * 1024
SIGNED_SECONDS = 60 * 60 * 24 * 7


def _ensure_bucket(db) -> None:
    try:
        db.storage.get_bucket(BUCKET)
        return
    except Exception:
        pass
    try:
        db.storage.create_bucket(
            BUCKET,
            options={
                "public": False,
                "file_size_limit": MAX_BYTES,
                "allowed_mime_types": ["application/pdf"],
            },
        )
    except Exception:
        pass


def _signed_url(db, storage_path: str) -> str | None:
    try:
        res = db.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_SECONDS)
    except Exception:
        return None
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return None


def upload_proforma_pdf(db, proforma_id: str, file: UploadFile) -> dict:
    _ensure_bucket(db)
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="PDF vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El PDF pesa demasiado")

    storage_path = f"{proforma_id}/{uuid4().hex}.pdf"
    try:
        db.storage.from_(BUCKET).upload(
            storage_path,
            data,
            {"content-type": "application/pdf", "upsert": "true"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar el PDF. ¿Existe el bucket proforma-pdfs? ({exc})",
        ) from exc

    url = _signed_url(db, storage_path)
    if not url:
        raise HTTPException(status_code=500, detail="PDF guardado pero no se pudo armar el link")
    return {"url": url, "path": storage_path}
