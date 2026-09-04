# Vehimac ERP — Contexto técnico

Documento de continuidad. **Última actualización: 2026-09-04** (proceso por pieza, salarios, estado de resultados).  
En un chat nuevo: pegá o adjuntá este archivo y pedí “seguí desde CONTEXT.md”.

---

## Estado git (hoy)

Repo: `https://github.com/degosenpai211/Vehimac.git`

| Rama | Qué hay | En GitHub |
|------|---------|-----------|
| `master` | Features de producto. **Producción**. Proceso por pieza, salarios y EE.RR. | Sí |
| `migracion-vps` | **No hay código de VPS**; no mezclar Path A aquí. | Sí |

No mezclar infra VPS con features. Path A (Postgres nativo, Nginx, PM2, Hostinger) **no está implementado**. `config.py` / `database.py` siguen con `SUPABASE_URL` + `SUPABASE_KEY` + `supabase-py`.

---

## Qué es

PWA/ERP liviano para taller mecánico en **Bolivia** (Bs., teléfonos +591).  
Sin auth: cualquiera con la URL opera. Auth queda para **después del VPS**.

---

## Stack actual (producción)

| Capa | Tech | Host |
|------|------|------|
| Frontend | React 18 + Vite 6 + Tailwind 3 + PWA | Vercel (`frontend/`) |
| Backend | FastAPI + `supabase-py` (PostgREST, no ORM) | Railway `https://vehimac-production-9609.up.railway.app` |
| DB | Postgres | Supabase — **solo Postgres**, no Auth/Storage/RLS de usuarios |

Env:

- Backend: `SUPABASE_URL`, `SUPABASE_KEY` (service role), `CORS_ORIGINS`
- Frontend: `VITE_API_URL` = URL del backend **sin** `/api`. `api.js` concatena `/api`.

Deploy breaking: **SQL Supabase → Railway → Vercel**.

**Plan futuro (no código):** un VPS Hostinger KVM2, Postgres nativo, FastAPI + PM2, frontend estático + Nginx, SSL.

---

## Features vigentes

### Órdenes

- Kanban `en_proceso` → `terminado` → `entregado`. IVA 13% se **suma**. Adelanto tipeable.
- WhatsApp: ícono 44px en card OT. iOS/PWA usa `whatsapp://`.
- **Proceso por pieza** (Excel de OT): 5 pasos fijos — Diseño, Soldadura, Afinado, Pintura, Instalación. Acordeón por pieza. Estado **a mano** (Pendiente / En proceso / Completado) tocando círculo o badge. Check al lado para **confirmar proceso listo** cuando los 5 están Completado. Técnico de Equipo (activos). Fecha/hora por paso. Observación por pieza (máx. 80, sin mostrar el contador). Entrega OT + observación van **al pie**, no como 6.º paso. SQL `migration_v11.sql` (`order_items.process` JSONB).
- En el form de pieza **no** hay mecánico/diseñador sueltos (van en cada paso). La descripción del trabajo **sí** se mantiene.
- FECHA ENTREGA CLIENTE = `estimated_delivery_date` de la OT.

### Equipo

- Dos listas: mecánicos y diseñadores (`mechanics.role`). SQL `migration_v10.sql`.
- El sueldo **no** se edita en Equipo; se carga en Finanzas → Salarios.

### Salarios (Finanzas)

- Tres modos: fijo, por trabajos, o ambos. Períodos: semanal, quincenal (15 y fin de mes), mensual.
- Mensual: desde el día de pago, **5 días hábiles** de plazo (lun–vie).
- **Pagar** crea un **egreso** categoría `Sueldos y salarios`. SQL `migration_v12.sql` (sueldo en `mechanics` + `finances.mechanic_id`).

### Finanzas (estado de resultados tipo Excel EE.RR.)

Tres pestañas: **Resultados** | **Movimientos** | **Salarios**.

**Resultados:** primero **semana**, después **mes** (flechas para cambiar período). Filas fijas del Excel; celdas vacías son normales.

| Grupo | Filas | Origen |
|-------|--------|--------|
| Ingresos | Ingresos por servicios | Auto: adelantos OT + cobro al entregar + QR de OT |
| Ingresos | Otros ingresos | Manual |
| Costos directos | Filamentos | Manual |
| Costos directos | Plastic 27 | **Compra** (egreso). El botón QR Plastic 27 registra el gasto de filamento, no una venta. |
| Costos indirectos | Insumos, sueldos, alquiler 1 y 2, servicios básicos, oficina, marketing, comisiones, mantenimiento, herramientas, otros varios, otros egresos, previsiones, intereses, fiscales, tributarios | Sueldos auto. Alquileres: monto **fijo** que define el usuario (Ajustes) y se **Carga** cuando se paga. El resto manual. |

- **Nuevo registro:** hay que elegir **una de esas filas**. Palabra en UI: **egreso** (en DB el tipo sigue `gasto`).
- **IVA facturado:** informativo (OT con factura en el período). El pago a impuestos es la fila Tributarios/Fiscales, a mano.
- **Efectivo:** saldo = efectivo inicial (ajuste) + todos los ingresos − todos los egresos.
- SQL `migration_v13.sql` (`finance_settings`: `cash_opening`, `rent_1`, `rent_2`).

### Proformas, fotos, PWA, QR OT

- Proformas: sin Aprobar. PDF teal + WhatsApp al cliente (bucket `proforma-pdfs`). SQL v6, v8, v9.
- Fotos OT: bucket `ot-photos`, máx. 3. SQL v7.
- QR cobro OT: Mercantil ↔ Ganadero. BNB solo en Finanzas (ahora como compra Plastic 27).
- PWA iPhone: PNG apple-touch, nav inferior, agregar desde Safari.

### No implementado (acordado)

- Auth en el VPS
- Ruta pública `/orden/:id/pago`
- Driver Postgres nativo / Nginx / PM2
- Cron auto-borrado fotos 90 días
- Logo PNG real de VEHIMAC en la proforma (hoy SVG)

---

## SQL a ejecutar en Supabase

Producción **ya tiene** v2 y v3. Ir en orden lo que falte:

| Archivo | Para |
|---------|------|
| `migration_v4.sql` | IVA + tabla `mechanics` |
| `migration_v5.sql` | Pago QR OT |
| `migration_v6.sql` | `proformas` + `proforma_items` |
| `migration_v7.sql` | `order_photos` + bucket `ot-photos` |
| `migration_v8.sql` | columnas de líneas de proforma |
| `migration_v9.sql` | PDF proforma / bucket `proforma-pdfs` |
| `migration_v10.sql` | `mechanics.role` + diseñador en OT/piezas |
| `migration_v11.sql` | `order_items.process` JSONB |
| `migration_v12.sql` | salarios en `mechanics` + `finances.mechanic_id` |
| `migration_v13.sql` | `finance_settings` (efectivo + alquileres fijos) |

---

## Arquitectura (decisiones vigentes)

- JSX, no TS. Kanban 3 columnas.
- Piezas de OT ≠ inventario. Piezas guardadas = OT `terminado`.
- Finanzas: tipo interno `ingreso` \| `gasto`; en pantalla se dice egreso.
- Categorías del EE.RR. viven en `backend/app/services/pl.py` y `frontend/src/utils/financeCatalog.js`.

API `/api`: `clients`, `mechanics`, `work-orders`, `proformas`, `stored-pieces`, `finances` (`/pl`, `/settings`, `/salaries`, `/rents/{1|2}`), `dashboard`.

Front: `/`, `/piezas-guardadas`, `/clientes`, `/equipo`, `/ordenes`, `/proformas`, `/finanzas`.

---

## Local

```bash
cd backend   # .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
uvicorn app.main:app --reload --port 8000

cd frontend  # .env: VITE_API_URL=http://localhost:8000
npm run dev
```
