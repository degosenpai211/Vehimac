from fastapi import APIRouter, HTTPException

from app.database import get_supabase
from app.services.proforma_pdf import resolve_short_link

router = APIRouter(prefix="/p", tags=["Links públicos"])


@router.get("/{code}")
def open_proforma_pdf(code: str):
    db = get_supabase()
    try:
        url = resolve_short_link(db, code)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="No encontramos esa proforma")
    return {"url": url}
