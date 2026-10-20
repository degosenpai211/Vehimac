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

- **Panel** — alarmas de OT, KPIs del taller; ingresos/egresos solo si el usuario es `admin`
- **Piezas guardadas** — órdenes en Terminado
- **Clientes** — WhatsApp, filtros, piezas sin recoger
- **Equipo** — mecánicos y diseñadores (activos). El sueldo se carga en Finanzas. El rol de Equipo **no** es el login.
- **Órdenes** — Kanban, proceso por pieza, QR de cobro, WhatsApp. Fotos (máx. 3) al **crear o editar** la OT; se comprimen en el celular. El ícono de cámara en la card del Kanban está **oculto** (el código queda por si se vuelve a mostrar).
- **Proformas** — PDF con logo oficial VEHIMAC, eslogan *Soluciones con impresiones 3D — Plastic 27*, teléfonos 71015081 / 60830350 (sin NIT). Cierre: «Atentos a su confirmación». Envío por WhatsApp (PDF JPEG liviano). Se puede cotizar a un **interesado** (nombre + WhatsApp) sin pasarlo a Clientes: entra a la ficha cuando **acepta** o al **convertir a OT**. Si no acepta, se borra todo (o a los 7 días). Al **convertir a OT**, el texto de la cotización va a **Pieza**.
- **Finanzas** — solo rol `admin`. Tres pestañas:
  - **Resultados** — estado de resultados (semana, después mes), mismas filas que el Excel EE.RR., gráfico, alquileres fijos
  - **Movimientos** — listado; al crear hay que elegir el rubro
  - **Salarios** — sueldo fijo / por trabajos / ambos; el pago es un egreso

En pantalla se dice **egreso** (no “gasto”). Plastic 27 en Finanzas es **compra de filamento** (costo directo), no venta.

El árbol de carpetas (módulos, componentes, tablas) está en `CONTEXT.md`.

## Setup

### 1. Supabase
- **Proyecto nuevo (sin tablas):** ejecutar `supabase/schema.sql` y después las migraciones `v2`…`v16` y **`v19`** que apliquen
- **Proyecto existente:** no ejecutes `schema.sql`. Corré en orden los `supabase/migration_v*.sql` que falten  
  ⚠️ Para login: **v19** (`perfiles_usuario`). Signup público **apagado**. La primera vez, en `/login` se crean **dueño y programador juntos** (los dos admin). El resto se invita desde Tu cuenta. URL Configuration: `http://localhost:5173/recuperar-clave` y la de Vercel.

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
# .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
# opcional: APP_PASSWORD=... (activa el login; vacía = API abierta)
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
# .env: VITE_API_URL=http://localhost:8000
#       VITE_SUPABASE_URL=...
#       VITE_SUPABASE_ANON_KEY=...  (anon, nunca service_role)
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
- **Backend** → Railway (`backend/`, variables Supabase + CORS + `APP_PASSWORD`)
- **DB** → Supabase SQL Editor (migraciones)

Orden de deploy si hay SQL nuevo: **Supabase → Railway → Vercel**.

### Login

Con `APP_PASSWORD` cargada en Railway, todo `/api` pide iniciar sesión con la contraseña del taller (queda público solo el link corto de proforma, `/api/p/{code}`, y `/docs`). La sesión dura 30 días (`AUTH_TOKEN_DAYS`); cambiar la contraseña cierra todas las sesiones. Sin la variable la API queda abierta, como antes.

Para activarlo: desplegar primero el frontend y el backend con este código y **después** cargar `APP_PASSWORD` en Railway. Tests: `cd backend && python -m unittest discover -s tests -t .`
