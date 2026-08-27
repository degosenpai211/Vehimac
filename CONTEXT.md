# Vehimac ERP — Contexto técnico

Documento de continuidad. **Última actualización: 2026-08-26 (agenda de entregas + reprogramar + avisos + iPhone).**  
En un chat nuevo: pegá o adjuntá este archivo y pedí “seguí desde CONTEXT.md”.

---

## Estado git (hoy)

Repo: `https://github.com/degosenpai211/Vehimac.git`

| Rama | Qué hay | En GitHub |
|------|---------|-----------|
| `master` | Features de producto. **Producción**. HEAD `2fb8eda` (fotos OT + Storage temporal). | Sí, sync |
| `migracion-vps` | Quedó en `ea98738` (un commit atrás). **No hay código de VPS**; no mezclar Path A aquí. | Sí |

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
- **Kanban:** chips Hoy / Esta semana / Atrasadas / Todas (igual que antes). **Más** chips de entrega: Entregar hoy / Mañana / Pasado / Próx. semana (fecha de entrega exacta, sin entregadas). En la card: **Reprogramar** +1…+5 días o +1 semana; pregunta si avisar por WhatsApp.
- **Inicio:** listas Se entregan hoy / mañana / pasado / próxima semana (en proceso y terminado = recoger). El recuadro rojo de vencidas en proceso se mantiene. Botón **Activar avisos** (Notification API, una vez al día). En iPhone hay que **Agregar a pantalla de inicio**; sin eso Safari casi no notifica.
- **iPhone 11–13:** misma UI que Android. `viewport-fit=cover`, safe-area, `100dvh`, inputs 16px (sin zoom), botones ≥44px. No hay app aparte.
- **WhatsApp en la card de OT** (no en el QR de clientes). El número vive en `clients.whatsapp`. En el form de OT, al elegir cliente, se puede cargar/editar WhatsApp y se **guarda en el cliente**. Link `wa.me` con helper `whatsappUrl` (+591).
- **Equipo** (`/equipo`): tabla `mechanics`, agregar/desactivar (no borrar). En cada **pieza** de la OT, autocompletado (`fr` → Franz) y texto libre.
- **QR de cobro OT (servicios/trabajos):** ícono QR en la card. Solo **Mercantil Santa Cruz** y **Banco Ganadero**, uno a la vez. Al cerrar, el siguiente open usa el otro (`localStorage` `vehimac_qr_next`). **No** rota cada 4 s. **BNB no entra acá.** Botón **Ya pagó** registra ingreso categoría `QR`. JPGs: `frontend/public/qr/mercantil.jpg`, `ganadero.jpg`.
- **QR Plastic 27:** botón en **Finanzas**. Muestra el QR de **BNB** (`bnb-plastic27.jpg`). **Ya pagó** crea un ingreso categoría `Plastic 27`, sin OT.
- **Fotos de OT (temporal, Supabase Storage):** bucket `ot-photos`, tabla `order_photos`. Kanban solo muestra ícono cámara + contador (sin descargar imágenes). Al abrir **detalle** se piden URLs firmadas (lazy). Hasta 3 fotos, ~5 MB, jpg/png/webp, cámara del celular. Miniaturas 80×80; tap abre lightbox (flechas, swipe, X / tap afuera). Código en `backend/app/services/photos.py` con comentarios **VPS** (`/var/www/vehimac/uploads/` + Nginx). Hace falta ejecutar `migration_v7.sql`.
- **Proformas:** menú `/proformas` + botón “Crear proforma” en Órdenes. El PDF clona la plantilla Excel (teal `#008B9B`, filas intercaladas, nota, firma Marcelo Calvimontes, GRACIAS!!!). Número de pedido = entero (`195`, no `PRO-004`). Líneas: descripción, cantidad, precio unitario, % desc. **Sin IVA en el papel.** Al convertir a OT se copia el neto de cada línea y solo se pide adelanto. Router montado en `main.py`. SQL: `migration_v6.sql` + `migration_v8.sql` (columnas quantity/unit_price/discount_percent). Logo actual es un SVG de aproximación (`VehimacLogo.jsx`); reemplazar por el PNG real cuando lo tengan.

### No implementado (acordado)

- Auth en el VPS
- Ruta pública `/orden/:id/pago` para WhatsApp (opción B)
- Driver Postgres nativo / Nginx / PM2
- Cron auto-borrado fotos 90 días
- Mover fotos de Storage al filesystem del VPS (mismo `order_photos.path`)
- Logo PNG real de VEHIMAC en la proforma (hoy es SVG aproximado)

---

## SQL a ejecutar en Supabase (contenido del archivo, no la ruta)

Producción **ya tiene** v2 y v3.

| Archivo | Para |
|---------|------|
| `migration_v4.sql` | IVA + tabla `mechanics` |
| `migration_v5.sql` | Pago QR (`qr_paid`, `qr_bank`, `qr_paid_amount`, `qr_paid_at`) |
| `migration_v6.sql` | `proformas` + `proforma_items` |
| `migration_v7.sql` | `order_photos` + bucket Storage `ot-photos` (crear en SQL Editor) |
| `migration_v8.sql` | `proforma_items`: `quantity`, `unit_price`, `discount_percent` |

Sin v4/v5, Equipo / IVA / “Ya pagó” fallan.

Tablas: `clients`, `vehicles`, `work_orders`, `order_items`, `finances`, `mechanics`, `proformas`, `proforma_items`, `order_photos`.

Nombres en inglés (`work_orders`, no `ordenes`).

---

## QR de cobro (archivos estáticos)

Vite sirve `frontend/public/` en la raíz. No hay upload: son fotos de los QR del banco.

| Archivo | Banco | Uso |
|---------|-------|-----|
| `frontend/public/qr/mercantil.jpg` | Mercantil Santa Cruz | OT / servicios / trabajos |
| `frontend/public/qr/ganadero.jpg` | Banco Ganadero | OT / servicios / trabajos |
| `frontend/public/qr/bnb-plastic27.jpg` | BNB | Solo venta **Plastic 27** (Finanzas) |

Órdenes rotan Mercantil ↔ Ganadero. Finanzas → **QR Plastic 27** abre el BNB.

**Fotos del auto/piezas por OT:** modal de detalle + Storage `ot-photos`. Kanban solo muestra contador.

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

API `/api`: `clients`, `mechanics`, `work-orders` (+ `/kanban`, `/advance`, `/qr-payment`, `/{id}/photos`), `proformas` (+ `/convert`), `stored-pieces`, `finances`, `dashboard`.

Front: `/`, `/piezas-guardadas`, `/clientes`, `/equipo`, `/ordenes`, `/proformas`, `/finanzas`.

---

## Comercial (Bolivia)

Fase 1 ~1.700 Bs. Mantenimiento 450 o 600 Bs/mes. VPS + auth + PDF se cotizan aparte.

---

## Pendiente (prioridad)

1. Correr SQL v4, v5, v6, **v7** (fotos), **v8** (columnas de proforma)
2. Crear bucket: el `INSERT` de `migration_v7.sql` lo hace; si falla, en Supabase → Storage → New bucket `ot-photos` (privado, 5 MB)
3. Reemplazar logo SVG de la proforma por el PNG oficial
4. Path A VPS en rama propia, sin mezclar con features
5. Cron auto-borrado de fotos a 90 días
6. Link público de pago QR
7. README (`VITE_API_URL` sin `/api`)
8. Auth, OT1670, proveedores

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
