# Vehimac ERP — Contexto técnico

Documento de continuidad. **Última actualización: 2026-09-08** (fotos en alta/edición de OT, compresión, logo proforma).  
En un chat nuevo: pegá o adjuntá este archivo y pedí “seguí desde CONTEXT.md”.

---

## Estado git (hoy)

Repo: `https://github.com/degosenpai211/Vehimac.git`

| Rama | Qué hay | En GitHub |
|------|---------|-----------|
| `master` | Features de producto. **Producción**. Proceso, salarios, EE.RR., logo oficial de proforma. | Sí |
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

- Proformas: sin Aprobar. PDF teal + WhatsApp (bucket `proforma-pdfs`). SQL v6, v8, v9.
- Logo oficial `frontend/public/vehimac-logo.jpg` (ya no es el SVG aproximado).
- Cabecera: **VEHIMAC** subrayado → eslogan *Soluciones con impresiones 3D — Plastic 27* → **Teléfonos: 71015081 / 60830350** (sin NIT) → dirección Hilandería.
- Debajo de Nota: **Atentos a su confirmación** (no va Marcelo / Gerente general).
- Al **convertir a OT**: el texto de la línea de cotización entra en `part_name` (**Pieza**). La descripción del trabajo copia lo mismo para no quedar vacía; se puede editar después. OTs convertidas *antes* de este cambio no se corrigen solas.
- Fotos OT: bucket `ot-photos`, máx. 3. SQL v7. Se sacan/cargan **al crear o editar** la OT (`OrderPhotosField`). Se comprimen en el celular (`browser-image-compression`, ~1.3 MB / 2200 px) antes de subir; si falla, va el original. Al editar se puede borrar y volver a subir. El ícono de cámara en la **card del Kanban** está oculto (`SHOW_CARD_PHOTO_ICON = false` en `Ordenes.jsx`); el detalle con galería sigue existiendo por si se vuelve a mostrar.
- QR cobro OT: Mercantil ↔ Ganadero. BNB solo en Finanzas (compra Plastic 27).
- PWA iPhone: PNG apple-touch, nav inferior, agregar desde Safari.

### No implementado (acordado)

- Auth en el VPS
- Ruta pública `/orden/:id/pago`
- Driver Postgres nativo / Nginx / PM2
- Cron auto-borrado fotos 90 días

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

## Árbol del repo (solo lo del proyecto)

Sin `node_modules`, `venv`, `dist`, `__pycache__`, lockfiles ni configs default de Vite/Tailwind.

```
vehimac/
├── README.md
├── CONTEXT.md
├── COTIZACION.md
├── backend/
│   ├── migrate.py
│   ├── requirements.txt
│   ├── railway.toml
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py
│       ├── routers/
│       │   ├── clients.py
│       │   ├── mechanics.py
│       │   ├── work_orders.py
│       │   ├── proformas.py
│       │   ├── stored_pieces.py
│       │   ├── finances.py
│       │   └── dashboard.py
│       ├── schemas/
│       │   ├── client.py
│       │   ├── mechanic.py
│       │   ├── work_order.py
│       │   ├── proforma.py
│       │   ├── finance.py
│       │   └── product.py
│       ├── services/
│       │   ├── orders.py
│       │   ├── billing.py
│       │   ├── salary.py
│       │   ├── pl.py
│       │   ├── photos.py
│       │   └── proforma_pdf.py
│       └── utils/
│           └── phone.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx          # /
│   │   │   ├── PiezasGuardadas.jsx    # /piezas-guardadas
│   │   │   ├── Clientes.jsx           # /clientes
│   │   │   ├── Equipo.jsx             # /equipo
│   │   │   ├── Ordenes.jsx            # /ordenes
│   │   │   ├── Proformas.jsx          # /proformas
│   │   │   └── Finanzas.jsx           # /finanzas
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── AgendaList.jsx
│   │   │   ├── ClientSearch.jsx
│   │   │   ├── MechanicSearch.jsx
│   │   │   ├── PieceProcessFields.jsx
│   │   │   ├── OrderDetailModal.jsx
│   │   │   ├── PaymentQrModal.jsx
│   │   │   ├── ProductQrModal.jsx
│   │   │   ├── PhotoLightbox.jsx
│   │   │   ├── OrderPhotosField.jsx
│   │   │   ├── RescheduleRow.jsx
│   │   │   ├── ProformaSheet.jsx
│   │   │   ├── ProformaPreview.jsx
│   │   │   ├── VehimacLogo.jsx
│   │   │   ├── FinanceChart.jsx
│   │   │   ├── ResultsSection.jsx
│   │   │   ├── SalarySection.jsx
│   │   │   ├── StatCard.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Toast.jsx
│   │   │   ├── Loading.jsx
│   │   │   └── EmptyState.jsx
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── proformaPdf.js
│   │   └── utils/
│   │       ├── status.js
│   │       ├── process.js
│   │       ├── financeCatalog.js
│   │       ├── notifications.js
│   │       └── compressImage.js
│   └── public/
│       ├── vehimac-logo.jpg
│       └── qr/
│           ├── mercantil.jpg
│           ├── ganadero.jpg
│           └── bnb-plastic27.jpg
└── supabase/
    ├── schema.sql                 # solo proyecto nuevo
    └── migration_v2.sql … v13.sql
```

**Tablas** (después de las migraciones): `clients`, `vehicles`, `mechanics`, `work_orders`, `order_items`, `order_photos`, `proformas`, `proforma_items`, `finances`, `finance_settings`.

**Buckets Storage:** `ot-photos`, `proforma-pdfs`.

---

## Local

```bash
cd backend   # .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
uvicorn app.main:app --reload --port 8000

cd frontend  # .env: VITE_API_URL=http://localhost:8000
npm run dev
```
