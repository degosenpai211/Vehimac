from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import get_supabase
from app.routers import clients, dashboard, finances, mechanics, stored_pieces, work_orders

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

app.include_router(clients.router, prefix="/api")
app.include_router(mechanics.router, prefix="/api")
app.include_router(work_orders.router, prefix="/api")
app.include_router(stored_pieces.router, prefix="/api")
app.include_router(finances.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


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
