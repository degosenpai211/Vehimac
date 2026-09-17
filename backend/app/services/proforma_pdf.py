"""PDF de proforma para enviar por WhatsApp (link corto + URL firmada).

TEMPORAL: Supabase Storage, bucket `proforma-pdfs`.
VPS: guardar en filesystem y devolver URL pública Nginx.
"""

from datetime import datetime, timedelta, timezone
from secrets import choice
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.config import settings

BUCKET = "proforma-pdfs"
MAX_BYTES = 8 * 1024 * 1024
CLICK_SIGNED_SECONDS = 60 * 60 * 2
LINK_DAYS = 30
CODE_LEN = 6
CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"


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


def _signed_url(db, storage_path: str, seconds: int = CLICK_SIGNED_SECONDS) -> str | None:
    try:
        res = db.storage.from_(BUCKET).create_signed_url(storage_path, seconds)
    except Exception:
        return None
    if isinstance(res, dict):
        return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
    return None


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _new_short_code(db) -> str:
    for _ in range(16):
        code = "".join(choice(CODE_ALPHABET) for _ in range(CODE_LEN))
        try:
            found = db.table("proformas").select("id").eq("pdf_short_code", code).limit(1).execute()
        except Exception:
            return code
        if not found.data:
            return code
    raise HTTPException(status_code=500, detail="No se pudo armar un link corto")


def share_url_for(code: str | None) -> str | None:
    if not code:
        return None
    base = (settings.public_app_url or "https://vehimacc.vercel.app").rstrip("/")
    return f"{base}/p/{code}"


def _save_short_link(db, proforma_id: str, storage_path: str) -> str | None:
    expires = (datetime.now(timezone.utc) + timedelta(days=LINK_DAYS)).isoformat()
    code = None
    try:
        row = (
            db.table("proformas")
            .select("pdf_short_code")
            .eq("id", proforma_id)
            .limit(1)
            .execute()
        )
        existing = (row.data or [{}])[0] if row.data else {}
        code = existing.get("pdf_short_code") or _new_short_code(db)
        db.table("proformas").update({
            "pdf_short_code": code,
            "pdf_storage_path": storage_path,
            "pdf_expires_at": expires,
        }).eq("id", proforma_id).execute()
    except Exception:
        return None
    return code


def resolve_short_link(db, code: str) -> str:
    token = (code or "").strip().lower()
    if len(token) != CODE_LEN or any(c not in CODE_ALPHABET for c in token):
        raise HTTPException(status_code=404, detail="No encontramos esa proforma")
    try:
        result = (
            db.table("proformas")
            .select("pdf_storage_path, pdf_expires_at")
            .eq("pdf_short_code", token)
            .limit(1)
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=404, detail="No encontramos esa proforma")
    row = (result.data or [None])[0]
    if not row or not row.get("pdf_storage_path"):
        raise HTTPException(status_code=404, detail="No encontramos esa proforma")
    expires = _parse_dt(row.get("pdf_expires_at"))
    if not expires or expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Este link venció (vale 30 días).")
    url = _signed_url(db, row["pdf_storage_path"])
    if not url:
        raise HTTPException(status_code=500, detail="No se pudo abrir el PDF")
    return url


def delete_proforma_pdfs(db, proforma_id: str) -> None:
    try:
        listed = db.storage.from_(BUCKET).list(proforma_id)
        names = [item.get("name") for item in (listed or []) if item.get("name")]
        if names:
            db.storage.from_(BUCKET).remove([f"{proforma_id}/{n}" for n in names])
    except Exception:
        pass


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
    short_code = _save_short_link(db, proforma_id, storage_path)
    return {
        "url": url,
        "path": storage_path,
        "short_code": short_code,
        "share_url": share_url_for(short_code) or url,
    }
