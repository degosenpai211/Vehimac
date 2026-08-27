# Vehimac ERP — Cobro por fases (Bs)

Documento para **facturar al taller**. No es el CONTEXT técnico.  
Fecha: 27 ago 2026. Montos en **bolivianos**.

---

## Cómo se cobra (lo acordado)

| # | Módulo | Qué incluye | Bs |
|---|--------|-------------|---:|
| **A** | Taller operativo | QR de cobro (Mercantil / Ganadero en OT + BNB Plastic 27), ciclos En proceso → Terminado → Entregado, OT con adelanto tipeable, registro de mecánicos, prioridad de entregas (hoy / mañana / atrasadas), varias piezas por OT, IVA 13% que se suma | **850** |
| **B** | Proforma + panel | Crear y editar proforma (PDF tipo planilla VEHIMAC), convertir a OT, mejoras a la vista de estadísticas (Inicio) | **650** |
| **B+** | Extra gráficos (opcional) | Mismas pantallas de B: más gráficos y KPIs (ver lista abajo). Se hace **en el mismo módulo B**, no es otra fase | **+100** |
| **C** | App en el celular | Avisos de entrega hoy/mañana, vista mobile, ajustes iPhone (notch, botones, sin zoom al escribir) | **500** |
| **D** | Subida al VPS | Pasar el sistema al VPS (Postgres, Nginx, SSL, corte desde Supabase/Railway/Vercel). **Sin login** | **750** |

**Subtotal A+B+C+D:** 2.750 Bs  
**Si pide B+ (gráficas/KPIs):** 2.850 Bs  

La **Fase 1 original** (~1.700 Bs) y el **mantenimiento** (450 o 600 Bs/mes) van **aparte** de esta tabla.

Auth / usuarios / “ciberseguridad” **no** van en D. Eso es otro presupuesto.

---

## Detalle de cada módulo (para el cliente)

### A — 850 Bs (hecho / en uso)

- Cobro con QR: un banco por vez en la OT; Plastic 27 en Finanzas.
- Kanban: En proceso, Terminado (pieza lista sin recoger), Entregado (cobra el resto).
- Adelanto al crear la OT (sugerencia 50%, el monto se escribe a mano).
- Equipo: alta/baja de mecánicos; se asignan por pieza.
- Entregas: ver qué es para hoy, la semana, atrasadas; reprogramar +1…+5 días o 1 semana.
- Varias líneas/piezas en una OT.
- Con factura / sin factura; IVA 13% **sumado** al neto.

### B — 650 Bs (hecho / en uso)

- Menú Proformas: alta, edición, estados, PDF, convertir a OT (solo pide adelanto).
- Inicio: más claro qué se entrega y números del taller (conteos, comparativo ingresos/gastos).

### B+ — +100 Bs (si lo pide)

Se suma **en B**, no se abre otra fase. Gráficas simples + los KPIs de la sección siguiente.

### C — 500 Bs (hecho / en uso)

- Avisos al abrir la app si hay entregas hoy o mañana (en iPhone: agregar a pantalla de inicio).
- La misma app sirve en Android e iPhone 11–13 (no hay app de tienda).

### D — 750 Bs (pendiente)

- Migrar a VPS Hostinger: dump Postgres, FastAPI + PM2, frontend estático + Nginx, certificado SSL, DNS.
- Fotos dejan de depender de Storage SaaS (carpeta en el servidor).
- **No incluye** usuarios y contraseñas.

---

## KPIs que sí le sirven al taller (para el +100 Bs)

No todos los números “de dashboard” sirven. Estos sí, en **Bs** y en **órdenes**:

| KPI | Por qué le importa |
|-----|-------------------|
| **Ingresos del día / semana / mes** | Ya existe en tabla; en gráfico se ve si el mes va flojo. |
| **Gastos vs ingresos (balance)** | Saber si el taller está en rojo esa semana. |
| **Por cobrar** (total OT − adelanto − QR, no entregadas) | Plata que **falta entrar** cuando el cliente recoja. |
| **Adelantos cobrados** (mes) | Caja chica / trabajo ya comprometido. |
| **Ticket promedio** (Bs por OT entregada) | Si bajan los precios o hay mucho trabajo chico. |
| **OTs atrasadas** (cantidad y %) | Promesas rotas; hay que llamar o reprogramar. |
| **Se entregan hoy / mañana** | Prioridad del piso; ya está en listas, el KPI es el número grande. |
| **Días promedio** (ingreso → entrega) | Si el taller se está empantanando. |
| **Piezas guardadas +7 días** | Trabajo hecho y **no cobrado** (el cliente no vino). |
| **Mix factura / sin factura** | Control de IVA vs trabajo en negro. |
| **Ingresos QR vs el resto** | Cuánto entra por transferencia. |
| **Servicios vs Plastic 27** | Dos líneas de negocio distintas. |
| **Proformas → OT** (% convertidas) | Cotizaciones que sí se cierran. |
| **Carga por mecánico** (piezas/OTs en proceso) | Quién está saturado. |

Para el +100 Bs alcanza con **6–8 de estos** (los de plata + atrasadas + hoy + ticket + por cobrar), en 2 o 3 gráficos. No hace falta un BI.

---

## Qué conviene vender después (análisis del sistema actual)

Mirando CONTEXT y README: el núcleo del taller **ya está**. Lo que falta es **casa propia, quién entra, y cobro hacia afuera**. No conviene inventar 10 módulos chicos.

### Precio suelto (Bs)

| Mejora / módulo | Por qué | Cobrar |
|-----------------|--------|--------:|
| **Login (1–2 usuarios del taller)** | Hoy cualquiera con el link opera. Va **después del VPS**. | 2.000–3.000 |
| **Link de pago por WhatsApp** (`/orden/:id/pago`) | El cliente paga sin entrar al ERP. | 1.200–1.800 |
| **Logo oficial en la proforma** | El PDF hoy lleva un dibujo aproximado. | 150–250 |
| **Fotos OT: borrar a los 90 días** | Disco/Storage no se llena. | 300–450 |
| **Proveedores / compras** | Materiales, no es el flujo del piso hoy. | 1.500–2.200 |
| **Inventario de stock** | Distinto a “piezas de la OT”. Solo si venden repuestos. | 2.000–3.000 |
| **Numeración tipo OT1670** (seguir el correlativo histórico) | Si les importa el número de papel viejo. | 250–400 |
| **PDF de cotización aparte de la proforma** | Si quieren otro diseño además del Excel. | 400–600 |
| **Arreglo editar cliente (autos)** | Deuda técnica: al editar se recrean autos. | 200–350 |
| **Backups automáticos en el VPS** | Dump diario. | 300–500 |

Auth **no** bajes de 2.000: es el trabajo más serio que queda, y sin eso el VPS sigue siendo un link público.

### Paquetes (mejor que 8 ítems sueltos)

| Paquete | Qué lleva | Bs | Cuándo |
|---------|-----------|---:|--------|
| **Cierre de producto** (A+B+C, sin VPS) | Lo que ya está en el taller | **2.000** | Cobrar ya |
| **Cierre + KPIs** | Igual + B+ | **2.100** | Si quieren las gráficas |
| **Casa propia** | Solo D (VPS) | **750** | Cuando cansen Railway/Vercel |
| **Casa + llave** | D + login | **2.800–3.500** | El salto de verdad |
| **Cobro al cliente** | Link público QR + WhatsApp | **1.200–1.800** | Cuando el piso ya usa el QR interno |
| **Papel lindo** | Logo real + pulido PDF + (opcional) correlativo OT | **400–700** | Barato, se nota |
| **Mantenimiento** | Bugs, QR, un ajuste chico/mes | **450 o 600 / mes** | Como ya tenían |

No metas inventario y proveedores en el mismo paquete que el VPS: son otro producto.

---

## Texto corto para pasar el presupuesto

> Lo último del taller (QR, adelantos, mecánicos, IVA, piezas, prioridad de entregas): **850 Bs**.  
> Proformas (crear/editar/PDF) y mejoras al panel: **650 Bs**. Si quieren gráficas y KPIs de caja/entregas, **+100 Bs** en el mismo trabajo.  
> Celular (avisos, iPhone, vista mobile): **500 Bs**.  
> Subirlo al VPS: **750 Bs**. Usuario y contraseña no van ahí; se cotiza aparte.

**A cobrar ahora (A+B+C, sin VPS, sin B+):** 2.000 Bs  
**Con gráficas:** 2.100 Bs  
**Cuando pidan el servidor:** +750 Bs
