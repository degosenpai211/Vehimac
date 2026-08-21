# Vehimac ERP — Contexto técnico

Documento de continuidad. **Última actualización: 2026-08-21 (fotos OT + Storage).**  
En un chat nuevo: pegá o adjuntá este archivo y pedí “seguí desde CONTEXT.md”.

---

## Estado git (hoy)

Repo: `https://github.com/degosenpai211/Vehimac.git`

| Rama | Qué hay | En GitHub |
|------|---------|-----------|
| `master` | Features de producto. **Producción** (Vercel + Railway). HEAD `ea98738` | Sí, sync |
| `migracion-vps` | Mismo commit `ea98738`. **No hay código de VPS todavía** (el nombre es para el futuro Path A) | Sí |

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
| Backend | FastAPI + `supabase-py` (PostgREST, no ORM) | Railway `https://vehimac-production.up.railway.app` |
| DB | Postgres | Supabase `https://uxirhklgpukrcvtnpcij.supabase.co` — **solo Postgres**, no Auth/Storage/RLS de usuarios |

Env:

- Backend: `SUPABASE_URL`, `SUPABASE_KEY` (service role), `CORS_ORIGINS`
- Frontend: `VITE_API_URL` = URL del backend **sin** `/api`. `api.js` concatena `/api`.

Deploy breaking: **SQL Supabase → Railway → Vercel**.

**Plan futuro (no código):** un VPS Hostinger KVM2, Postgres nativo, FastAPI + PM2, frontend estático + Nginx, SSL. Corte: dump final Supabase → restore VPS → DNS. Dejar SaaS pausado 1–2 semanas. Backend **sigue FastAPI** (no Node).

---

## Features en `master` (post `ea98738`)

### Ya usables en UI (hace falta SQL v4–v5)

- **Adelanto tipeable** (sugerencia 50% con botón). Campo de texto, no `type=number` con max.
- **IVA 13% se SUMA** (no incluido). Neto 90 → IVA 11,70 → total 101,70. Por **OT completa**, se elige **al crear**. Finanzas usan el **total**. Columnas: `billing_type`, `iva_amount`, `total_amount`. `price_charged` = neto.
- **Kanban:** chips Hoy / Esta semana / Atrasadas / Todas; **Limpiar filtros**; “Ver más” si >10 cards por columna. Botones En proceso → Terminado **o** Entregado.
- **WhatsApp en la card de OT** (no en el QR de clientes). El número vive en `clients.whatsapp`. En el form de OT, al elegir cliente, se puede cargar/editar WhatsApp y se **guarda en el cliente**. Link `wa.me` con helper `whatsappUrl` (+591).
- **Equipo** (`/equipo`): tabla `mechanics`, agregar/desactivar (no borrar). En cada **pieza** de la OT, autocompletado (`fr` → Franz) y texto libre.
- **QR de cobro (opción A, modal interno):** ícono QR en la card. Muestra **un** banco. Al cerrar, el siguiente open usa el **siguiente** banco (1→2→3, `localStorage` `vehimac_qr_next`). **No** rota cada 4 s. Botón **Ya pagó** registra ingreso categoría `QR` + flags `qr_paid`, `qr_bank`, `qr_paid_amount`, `qr_paid_at`. Al entregar, el resto = total − adelanto − pago QR.
- Placeholders: `frontend/public/qr/banco-1.svg` … `banco-3.svg`.
- **Fotos de OT (temporal, Supabase Storage):** bucket `ot-photos`, tabla `order_photos`. Kanban solo muestra ícono cámara + contador (sin descargar imágenes). Al abrir **detalle** se piden URLs firmadas (lazy). Hasta 3 fotos, ~5 MB, jpg/png/webp, cámara del celular. Miniaturas 80×80; tap abre lightbox (flechas, swipe, X / tap afuera). Código en `backend/app/services/photos.py` con comentarios **VPS** (`/var/www/vehimac/uploads/` + Nginx). Hace falta ejecutar `migration_v7.sql`.

### A medias — proformas

Especificación cerrada:

- Cotización = el PDF/comprobante; **proforma** = la fila. **Un solo** menú Proformas (no 3).
- Dos botones: **Crear OT directa** (Kanban) vs **Crear proforma** (listado).
- Proforma tiene cliente, piezas, monto, IVA. **Sin número de OT**. Número tipo `PRO-004` (`proformas.number`).
- Estados: `pendiente` → `aprobada` → `convertida` (o `rechazada`). Convertir pide **solo adelanto**, copia datos, genera OT correlativa, setea `work_order_id`.

**Código:** SQL `migration_v6.sql` + `backend/app/routers/proformas.py` + schemas.  
**Falta:** registrar el router en `main.py`, página `Proformas.jsx`, ítem sidebar, split de botones en Órdenes, endpoints en `api.js`.

### No implementado (acordado)

- Auth en el VPS
- Ruta pública `/orden/:id/pago` para WhatsApp (opción B)
- Driver Postgres nativo / Nginx / PM2
- PDF de cotización
- Cron auto-borrado fotos 90 días
- Mover fotos de Storage al filesystem del VPS (mismo `order_photos.path`)

---

## SQL a ejecutar en Supabase (contenido del archivo, no la ruta)

Producción **ya tiene** v2 y v3.

| Archivo | Para |
|---------|------|
| `migration_v4.sql` | IVA + tabla `mechanics` |
| `migration_v5.sql` | Pago QR (`qr_paid`, `qr_bank`, `qr_paid_amount`, `qr_paid_at`) |
| `migration_v6.sql` | `proformas` + `proforma_items` |
| `migration_v7.sql` | `order_photos` + bucket Storage `ot-photos` (crear en SQL Editor) |

Sin v4/v5, Equipo / IVA / “Ya pagó” fallan.

Tablas: `clients`, `vehicles`, `work_orders`, `order_items`, `finances`, `mechanics`, `proformas`, `proforma_items`, `order_photos`.

Nombres en inglés (`work_orders`, no `ordenes`).

---

## Cómo cargar las imágenes de los QR (bancos)

Hoy son **placeholders SVG** en el repo. El modal lee rutas fijas:

```js
// frontend/src/components/PaymentQrModal.jsx
{ id: 1, name: 'Banco 1', src: '/qr/banco-1.svg' },
{ id: 2, name: 'Banco 2', src: '/qr/banco-2.svg' },
{ id: 3, name: 'Banco 3', src: '/qr/banco-3.svg' },
```

Vite sirve `frontend/public/` en la raíz. `/qr/banco-1.svg` = archivo `frontend/public/qr/banco-1.svg`.

**Pasos:**

1. Sacá captura o PNG de cada QR de banco (Banco 1, 2, 3).
2. Guardalos en `frontend/public/qr/` **reemplazando** los SVG, o como `banco-1.png`, `banco-2.png`, `banco-3.png`.
3. Si usás `.png`: en `PaymentQrModal.jsx` cambiá `src` y el `name` (ej. `'Banco Unión'`).
4. Commit + push a `master` → Vercel rebuild. En local, `npm run dev` alcanza (archivos de `public/` no necesitan rebuild especial).

No uses Supabase Storage. No hay upload desde la app para estos QR: son **assets estáticos** a propósito (rotación 1-2-3, no aleatoria).

**Fotos del auto/piezas por OT:** todavía no hay UI ni carpeta `uploads/`. Eso es otra feature (máx. 3, desde el celular).

---

## Arquitectura (decisiones vigentes)

- BFF FastAPI delgado; queries estilo `.table().select()`. Migrar a SQL crudo es el grueso del Path A.
- JSX, no TS (`jsconfig.json`).
- Kanban 3 columnas; `finalizado` se mapea a `entregado`.
- Piezas de OT ≠ inventario. Piezas guardadas = OT `terminado`.
- Autos en `vehicles` (marca/modelo/año). Sin fiado (`balance` ≤ 0).
- Adelanto tipeable; cobro al entregar = total − adelanto − QR.
- OT: `MAX(ot_number)+1`, no usa `ot_number_seq`.
- Cliente: búsqueda por prefijo.

API `/api`: `clients`, `mechanics`, `work-orders` (+ `/kanban`, `/advance`, `/qr-payment`, `/{id}/photos`), `stored-pieces`, `finances`, `dashboard`. `proformas` existe el archivo pero **no** está en `main.py`.

Front: `/`, `/piezas-guardadas`, `/clientes`, `/equipo`, `/ordenes`, `/finanzas`. Falta `/proformas`.

---

## Comercial (Bolivia)

Fase 1 ~1.700 Bs. Mantenimiento 450 o 600 Bs/mes. VPS + auth + PDF se cotizan aparte.

---

## Pendiente (prioridad)

1. Correr SQL v4, v5, **v7** (fotos). v6 si se termina UI proformas
2. Crear bucket: el `INSERT` de `migration_v7.sql` lo hace; si falla, en Supabase → Storage → New bucket `ot-photos` (privado, 5 MB)
3. Terminar Proformas (router + página + convertir a OT)
4. Reemplazar SVG de QR por PNG reales
5. Path A VPS en rama propia, sin mezclar con features
6. Cron auto-borrado de fotos a 90 días
7. Link público de pago QR
8. README (`VITE_API_URL` sin `/api`)
9. Auth, PDF, OT1670, proveedores

Deuda: editar cliente borra/recrea autos; OT viejas pueden tener `ot_number` NULL; `product.py` leftover.

---

## Local

```bash
cd backend   # .env: SUPABASE_URL, SUPABASE_KEY, CORS_ORIGINS=http://localhost:5173
uvicorn app.main:app --reload --port 8000

cd frontend  # .env: VITE_API_URL=http://localhost:8000
npm run dev
```

Prueba: cliente + WhatsApp → OT con factura → Equipo/mecánico → QR “Ya pagó” → Finanzas categoría QR → Entregar cobra el resto.
