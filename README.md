# Vehimac ERP

ERP para taller mecánico en **Bolivia** (Bs., WhatsApp +591). PWA con React + FastAPI + Supabase.

## Flujo de órdenes

| Estado | Significado |
|--------|-------------|
| En proceso | Trabajo en curso |
| Terminado | Pieza lista, cliente **no la recogió** → aparece en **Piezas guardadas** |
| Entregado | Cliente recogió la pieza → se registra ingreso en finanzas |

## Módulos

- **Panel** — resumen, comparativo ingresos/gastos (hoy, 3d, semana, mes, 3 meses)
- **Piezas guardadas** — órdenes en Terminado con cliente y WhatsApp
- **Clientes** — saldo (0 o adelanto, sin fiado), filtros, piezas sin recoger
- **Órdenes** — Kanban con filtros por fechas
- **Finanzas** — ingresos y gastos en Bs.

## Setup

### 1. Supabase
- **Proyecto nuevo (sin tablas):** ejecutar `supabase/schema.sql`
- **Proyecto existente (ya tenías tablas):** ejecutar `supabase/migration_v2.sql`  
  ⚠️ No ejecutes `schema.sql` si ya existen tablas — fallará por columnas faltantes.

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
# .env: VITE_API_URL=http://localhost:8000/api
npm run dev
```

### 4. Migración CSV
```bash
cd backend
python migrate.py --data-dir ./datos --dry-run
python migrate.py --data-dir ./datos
```

## Deploy

- **Frontend** → Vercel (`frontend/`, `VITE_API_URL`)
- **Backend** → Railway (`backend/`, variables Supabase + CORS)
- **DB** → Supabase
