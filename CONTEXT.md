# Vehimac ERP — Contexto técnico

Documento de continuidad para desarrollo. Última actualización: 2026-08-21.

## Qué es

PWA/ERP liviano para un taller mecánico en Bolivia (moneda Bs., teléfonos +591). El cliente usa la app en el día a día para clientes, órdenes de trabajo (OT), piezas sin recoger y finanzas.

Sin autenticación de usuarios por ahora: el backend usa la **service role key** de Supabase. Quien tenga la URL de la PWA puede operar el sistema.

## Stack y deploy

| Capa | Tecnología | Host |
|------|------------|------|
| Frontend | React 18 + Vite 6 + Tailwind 3 + PWA (`vite-plugin-pwa`) | Vercel (`frontend/`) |
| Backend | FastAPI, cliente oficial de Supabase | Railway (`backend/`, Nixpacks) |
| Base de datos | PostgreSQL (Supabase) | Supabase |
| Repo | GitHub `degosenpai211/Vehimac`, rama `master` | |

URLs de producción conocidas:

- Backend: `https://vehimac-production.up.railway.app`
- Health: `https://vehimac-production.up.railway.app/health`

Variables:

- Backend: `SUPABASE_URL`, `SUPABASE_KEY` (service role), `CORS_ORIGINS` (lista CSV; debe incluir la URL de Vercel y `http://localhost:5173`)
- Frontend: `VITE_API_URL` = base del backend **sin** `/api` (ej. `https://vehimac-production.up.railway.app`). `frontend/src/services/api.js` concatena `/api`. El README está desactualizado en este punto (dice `.../api`).

Orden de deploy cuando hay cambios breaking: **Supabase SQL → Railway → Vercel**.

---

## Arquitectura

### Decisión: BFF delgado sobre Supabase

El backend no usa SQLAlchemy ni un ORM. Habla con Postgres vía `supabase-py` (`app/database.py`, cliente cacheado con `lru_cache`). FastAPI valida con Pydantic y concentra la lógica de negocio (adelantos, cobro al entregar, numeración OT).

Motivo: el MVP debía salir rápido, con RLS/Postgres ya en Supabase, y un solo host de API (Railway) para CORS y reglas de negocio que no se pueden dejar en el cliente.

### Decisión: frontend JS, no TypeScript

El proyecto nació en JSX. Hubo un `tsconfig.json` que rompía el IDE; se reemplazó por `jsconfig.json`. No hay planes de migrar a TS en Fase 1.

### Decisión: PWA instalable, no app nativa

`vite-plugin-pwa` con `registerType: autoUpdate`, manifest en español, `display: standalone`. Cache de API con Workbox `NetworkFirst` (5 min). Pensado para tablet/celular en el taller.

### Decisión: Kanban como vista principal de órdenes

Estados fijos:

1. `en_proceso` — trabajo en curso
2. `terminado` — listo, cliente no recogió → alimenta **Piezas guardadas**
3. `entregado` — cliente recogió → dispara cobro en finanzas

Se abandonó el estado `finalizado` (el Kanban aún mapea `finalizado` → `entregado` por compatibilidad). Drag & drop con `@hello-pangea/dnd` **y** botones de fase (móvil y PC): desde En proceso se puede ir a Terminado **o** saltar a Entregado.

### Decisión: piezas de OT ≠ inventario

Se quitó la lógica de inventario/`work_order_items` (fallaba por permisos en Supabase). Las “piezas” de una OT son líneas de trabajo (`order_items`: parte, descripción, monto, mecánico), no stock. **Piezas guardadas** = órdenes en `terminado`, no un almacén.

### Decisión: autos en tabla `vehicles`, UI como “autos”

La tabla ya tenía `make`, `model`, `year`. No se rehízo el esquema: se reorientó la UI y la API (`autos` como alias de `vehicles`). Un cliente puede tener varios autos. `plate` existe en DB pero no se usa en el formulario.

`vehicle_type` en `work_orders` se dejó de usar en el formulario de órdenes: el auto vive en el cliente, no en la OT.

### Decisión: sin fiado

`clients.balance` solo puede ser **0 o negativo** (adelanto a favor del taller). Pydantic rechaza saldo positivo. El adelanto de una OT **resta** del saldo del cliente.

### Decisión: cobro partido (adelanto + resto)

Al crear/editar OT:

- Monto total = suma de `order_items.amount`
- Adelanto **tipeable** (sugerencia 50% vía botón, no fijo)
- Si se marca “Registrar adelanto ahora”: ingreso en `finances` (categoría `Adelantos`) + `advance_recorded` + actualización de saldo
- Al pasar a `entregado`: ingreso del resto (`total - advance` si el adelanto ya estaba registrado), flags `delivery_payment_recorded` y `finance_recorded`

El adelanto ya registrado **no se edita** desde la UI (evitar doble cobro / descuadre).

### Decisión: OT secuencial en aplicación, no solo secuencia SQL

`ot_number` es `INTEGER UNIQUE` en `work_orders`. `_next_ot_number()` toma `MAX(ot_number)+1`. Existe `ot_number_seq` en `migration_v3.sql`, pero el backend **no la usa** para asignar números (evita desfasajes si hay filas con NULL). El taller histórico iba ~OT1670; las OT nuevas arrancan desde 1 si no hay datos previos.

### Decisión: búsqueda de cliente por prefijo

Al crear una OT no hay `<select>` de todos los clientes. `ClientSearch` llama `GET /api/clients?search=&prefix=true` (`ILIKE name%`). “Die” → Diego.

---

## Base de datos

Migraciones (ejecutar en SQL Editor de Supabase, **contenido** del archivo, no la ruta):

| Archivo | Cuándo |
|---------|--------|
| `supabase/schema.sql` | Proyecto nuevo, sin tablas |
| `supabase/migration_v2.sql` | Proyecto existente pre-Fase 1 (columnas de saldo, etc.) |
| `supabase/migration_v3.sql` | OT, adelantos, `order_items` — **ya ejecutada** en el proyecto de producción (`setval` devolvió 1) |

Tablas relevantes:

- `clients` — nombre, teléfono, WhatsApp, notes, balance ≤ 0
- `vehicles` — autos del cliente (marca, modelo, año)
- `work_orders` — cabecera OT (`ot_number`, `price_charged`, `advance_amount`, `advance_recorded`, `delivery_payment_recorded`, `finance_recorded`, fechas)
- `order_items` — líneas de pieza/trabajo por OT (`ON DELETE CASCADE`)
- `finances` — ingresos/gastos; `work_order_id` opcional

El backend corre con **service role**; hay `GRANT` a `service_role` en las migraciones. No hay RLS pensado para usuarios finales.

---

## API (prefijo `/api`)

Routers en `backend/app/main.py` (versión API `2.0.0`):

| Prefijo | Rol |
|---------|-----|
| `/clients` | CRUD, `?prefix=true`, nested autos, `POST /{id}/autos` |
| `/work-orders` | CRUD, `/kanban`, `PATCH /{id}/status`, `POST /{id}/advance` |
| `/stored-pieces` | Órdenes `terminado` |
| `/finances` | CRUD + `/summary/periods` (hoy / semana / mes pasado + `total_adelantos`) |
| `/dashboard` | stats y finance-trends |

Lógica de cobro: `backend/app/services/orders.py`.

Frontend: `frontend/src/pages/` — Panel, Piezas guardadas, Clientes, Órdenes, Finanzas. `/inventario` redirige a `/piezas-guardadas`.

---

## Qué se implementó (Fase 1 real)

### MVP inicial

- Módulos Panel, Clientes, Órdenes Kanban, Piezas guardadas, Finanzas
- PWA, toasts, layout responsive
- Health check, CORS, deploy Railway/Vercel
- `migrate.py` para CSV históricos
- Fix URL base de API en producción (`VITE_API_URL` sin `/api`)

### Fase 1 acordada con el taller

- Clientes: nombre, teléfono, WhatsApp, notas, **varios autos** (marca/modelo/año)
- OT autoincrementales visibles en tarjetas (`OT1`, `OT2`…)
- Varias piezas por OT; total = suma
- Adelanto editable (no fijo al 50%); registro opcional en finanzas + saldo
- Búsqueda de cliente por prefijo
- Kanban con botones En proceso → Terminado **y** Entregado; Terminado → Entregado
- Finanzas: resúmenes hoy / esta semana / mes pasado, con adelantos
- Piezas guardadas muestran número de OT
- `vehicle_type` fuera del formulario de órdenes
- Entrega estimada se mantiene

Commits de referencia en `master`: `1e5fc5a` (Fase 1), `f2d2183` / `db5e574` (adelanto editable).

---

## Decisiones de producto / cobro (contexto comercial)

No son código, pero condicionan el alcance:

- Mercado: Bolivia, Bs.
- Fase 1 real cotizada ~1.700 Bs. (1.200 + 500 módulos MVP)
- Mantenimiento propuesto: 450 Bs/mes (host + bugs chicos + 2 consultorías×2h) o 600 Bs/mes (WhatsApp + más soporte)
- Fases 2/3 se cobran aparte

---

## Pendiente

### Técnico / deuda conocida

- [ ] **README** — actualizar `VITE_API_URL` (sin `/api`), documentar `migration_v3.sql` y el flujo de adelanto editable
- [ ] **Órdenes viejas sin `ot_number`** — pueden quedar en NULL; hay SQL de backfill en conversaciones previas, no está en un script del repo
- [ ] **Editar cliente / autos** — borra y recrea todos los autos (`Clientes.jsx`); funciona, pero pierde IDs y es frágil si falla a mitad
- [ ] **Numeración OT vs secuencia SQL** — `_next_ot_number` no usa `ot_number_seq`; riesgo de race si dos creaciones concurrentes (poco probable en un taller, no atómico)
- [ ] **Adelanto ya registrado** — no hay flujo para corregir monto si se cargó mal (habría que ajustar finanzas + saldo a mano)
- [ ] **Sin auth** — cualquier persona con la URL opera el ERP
- [ ] **schema.sql** no incluye columnas v3 (`ot_number`, `order_items`); un proyecto *nuevo* hoy debería correr schema + v3, o unificar schema
- [ ] `schema.py` de productos (`backend/app/schemas/product.py`) parece leftover de inventario, no está cableado

### Fase 2 (acordado como futuro, no implementado)

- Cotizaciones
- Empleados / mecánicos como entidad (hoy es texto libre por pieza)
- Proveedores
- WhatsApp transaccional (no solo link `wa.me`)
- PDF de OT
- Migración masiva para continuar desde ~OT1670
- Auth / roles (taller vs admin)

### Operación

- Confirmar que Vercel tiene `VITE_API_URL` correcto y Railway `CORS_ORIGINS` incluye el dominio de Vercel
- Planes free: Railway/Supabase pueden pausar; el mantenimiento mensual cubre host activo

---

## Cómo trabajar en local

```bash
# Backend
cd backend
# .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
# .env: VITE_API_URL=http://localhost:8000
npm run dev
```

Flujo mínimo de prueba: cliente con 2 autos → OT con 2 piezas y adelanto custom → Finanzas muestra el adelanto → Entregar OT registra el resto → Piezas guardadas solo si quedó en Terminado.
