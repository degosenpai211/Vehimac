# Vehimac ERP

ERP para taller mecánico en **Bolivia** (Bs., WhatsApp +591). PWA con React + FastAPI + Supabase.

## Flujo de órdenes

| Estado | Significado |
|--------|-------------|
| En proceso | Trabajo en curso |
| Terminado | Pieza lista, cliente **no la recogió** → aparece en **Piezas guardadas** |
| Entregado | Cliente recogió la pieza → se registra ingreso en finanzas |

Cada pieza tiene un **proceso** de 5 pasos (Diseño → Instalación): técnico, fecha/hora y estado a mano. La entrega al cliente es la fecha de la OT.

## Módulos

- **Panel** — alarmas de OT, KPIs, gráfica ingresos/egresos
- **Piezas guardadas** — órdenes en Terminado
- **Clientes** — WhatsApp, filtros, piezas sin recoger
- **Equipo** — mecánicos y diseñadores (activos). El sueldo se carga en Finanzas
- **Órdenes** — Kanban, proceso por pieza, QR de cobro, WhatsApp
- **Proformas** — PDF VEHIMAC y envío por WhatsApp
- **Finanzas** — tres pestañas:
  - **Resultados** — estado de resultados (semana, después mes), mismas filas que el Excel EE.RR., gráfico, efectivo, alquileres fijos
  - **Movimientos** — listado; al crear hay que elegir el rubro
  - **Salarios** — sueldo fijo / por trabajos / ambos; el pago es un egreso

En pantalla se dice **egreso** (no “gasto”). Plastic 27 en Finanzas es **compra de filamento** (costo directo), no venta.

## Setup

### 1. Supabase
- **Proyecto nuevo (sin tablas):** ejecutar `supabase/schema.sql` y después las migraciones `v2`…`v13` que apliquen
- **Proyecto existente:** no ejecutes `schema.sql`. Corré en orden los `supabase/migration_v*.sql` que falten  
  ⚠️ Lo último: **v11** proceso por pieza, **v12** salarios, **v13** efectivo y alquileres

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
# .env: VITE_API_URL=http://localhost:8000
# (sin /api: el front lo agrega solo)
npm run dev
```

### 4. Migración CSV
```bash
cd backend
python migrate.py --data-dir ./datos --dry-run
python migrate.py --data-dir ./datos
```

## Deploy

- **Frontend** → Vercel (`frontend/`, `VITE_API_URL` = URL del backend **sin** `/api`)
- **Backend** → Railway (`backend/`, variables Supabase + CORS)
- **DB** → Supabase SQL Editor (migraciones)

Orden de deploy si hay SQL nuevo: **Supabase → Railway → Vercel**.
