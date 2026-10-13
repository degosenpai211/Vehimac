import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import auth
from app.config import settings
from app.database import get_supabase
from app.routers import clients, dashboard, finances, mechanics, proformas, share, stored_pieces, work_orders

app = FastAPI(
    title="Vehimac ERP",
    description="ERP liviano para taller mecánico y fabricación de piezas",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not auth.auth_enabled():
    logging.getLogger("vehimac.auth").warning(
        "APP_PASSWORD no está definida: la API queda abierta a cualquiera con la URL."
    )

# Públicos: login y el link corto de proforma que abre el cliente por WhatsApp.
app.include_router(auth.router, prefix="/api")
app.include_router(share.router, prefix="/api")

protected = [Depends(auth.require_auth)]
app.include_router(clients.router, prefix="/api", dependencies=protected)
app.include_router(mechanics.router, prefix="/api", dependencies=protected)
app.include_router(work_orders.router, prefix="/api", dependencies=protected)
app.include_router(proformas.router, prefix="/api", dependencies=protected)
app.include_router(stored_pieces.router, prefix="/api", dependencies=protected)
app.include_router(finances.router, prefix="/api", dependencies=protected)
app.include_router(dashboard.router, prefix="/api", dependencies=protected)


@app.get("/")
def root():
    return {"message": "Vehimac ERP API", "version": "2.0.0", "docs": "/docs"}


@app.get("/health")
def health():
    try:
        db = get_supabase()
        db.table("clients").select("id", count="exact").limit(1).execute()
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "degraded", "database": "error", "detail": str(e)}
