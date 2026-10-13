# Rama `cambios-2`

Punto de partida antes de empezar los arreglos del backend. Esta rama guarda todo el trabajo que estaba sin commitear en `master` (login, roles y permisos), para que nada de eso se pierda y se pueda volver a este estado.

Los arreglos de la auditoría del backend van en commits posteriores sobre esta misma rama; están listados al final, en "Arreglos aplicados".

## Qué se sube

### Login y cuentas (backend)

- `backend/app/auth/` — módulo nuevo de autenticación:
  - `middleware.py`: exige sesión en todas las rutas salvo las públicas.
  - `store.py`: lectura de usuarios y perfiles en Supabase Auth, con caché de 60 s.
  - `accounts.py`: reglas de alta de dueños, invitaciones, pedidos de acceso, cambio de rol y activación.
  - `permissions.py`: roles `admin` y `co_admin` y sus permisos.
  - `deps.py`, `user.py`, `errors.py`: dependencias de FastAPI, modelos y error de auth.
- `backend/app/routers/auth.py` — endpoints `/api/auth/*`: estado, alta inicial de dueños, `me`, usuarios y pedidos de acceso.
- `backend/app/main.py` — registra el middleware de auth y el router nuevo.
- `backend/app/routers/finances.py` — todo `/api/finances` pasa a exigir el permiso `finanzas.ver`.
- `backend/app/routers/dashboard.py` — el panel se separa en `/stats` (taller, para todos) y `/finance-kpis` y `/finance-trends` (solo con permiso de finanzas).
- `backend/.env.example` — variables que espera el backend, sin valores.

### Login y cuentas (frontend)

- `frontend/src/auth/` — contexto de sesión, servicio de Supabase Auth, guardas de rutas y roles.
- `frontend/src/login/` — pantalla de login (formulario, botón de Google, campos, estilos).
- `frontend/src/pages/Login.jsx`, `RecuperarClave.jsx`, `Cuenta.jsx` — páginas nuevas.
- `frontend/src/components/AuthScreen.jsx`, `SetupOwners.jsx`, `AccessPeople.jsx`, `AccessJoinRequests.jsx` — alta inicial de dueños y gestión de accesos.
- `frontend/src/App.jsx` — rutas protegidas; Finanzas solo con permiso.
- `frontend/src/components/Layout.jsx` — el menú oculta lo que el rol no puede ver.
- `frontend/src/pages/Dashboard.jsx` — los números de plata solo se piden si el usuario tiene permiso.
- `frontend/src/services/api.js` — envía el token en cada pedido, reintenta al vencer la sesión y agrega las llamadas de auth.
- `frontend/src/index.css` — estilos de apoyo.
- `frontend/package.json`, `package-lock.json` — agrega `@supabase/supabase-js`.
- `frontend/.env.example` — agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, sin valores.

### Base de datos

- `supabase/migration_v17.sql` — tabla `app_users` (primer intento de cuentas del ERP).
- `supabase/migration_v19.sql` — tabla `perfiles_usuario` (rol, nombre y activo por usuario de Supabase Auth).
- `supabase/migration_v20.sql` — tabla `solicitudes_acceso` (pedidos de acceso pendientes).
- `supabase/listar_pagos_sueldo.sql` — consulta para revisar pagos de sueldo antes de borrar.

### Tests

- `backend/tests/test_auth.py` — reglas de cuentas y permisos.
- `backend/tests/test_work_order_rules.py` — reglas de períodos y resumen de piezas.
- `backend/app/services/work_order_rules.py` — reglas puras de OT. Hoy solo las usa su test; el router todavía tiene sus propias copias.

### Documentación y herramientas

- `README.md`, `CONTEXT.md` — actualizados con el login y los roles.
- `.cursor/rules/clean-code-estricto.mdc` — reglas del editor.

## Qué se dejó afuera a propósito

El repositorio es público, así que estos dos archivos quedaron sin subir:

- `supabase/cambios_sueldos.md` — contiene el ID y el secreto del cliente OAuth de Google.
- `supabase/salarios.md` — contiene pagos de sueldo reales con nombres de personas.

Siguen en la carpeta local, sin seguimiento de git.

## Arreglos aplicados

Cada lote es un commit aparte y se puede deshacer solo con `git revert <commit>`.

### Lote 1 — solo código, no toca la base de datos

- **Editar una OT ya no la deja a medias.** Antes se reemplazaban las piezas y después se validaba el adelanto; si la validación fallaba, quedaban piezas nuevas con el precio viejo. Ahora se valida primero (`routers/work_orders.py`).
- **El pago QR no registra plata de más.** Si la OT no tiene saldo pendiente, se rechaza aunque se mande un monto (`services/orders.py`).
- **Buscar con comas o paréntesis ya no rompe la consulta** en Clientes y Piezas guardadas. La limpieza del texto quedó en un solo lugar, `utils/search.py`, que también usan las OT.
- Tests nuevos en `backend/tests/test_order_guards.py`.

## Cómo volver atrás

- Descartar todo lo de esta rama: `git checkout master` y borrar la rama `cambios-2`. `master` no se modificó.
- Volver a este punto después de aplicar arreglos: volver al commit "Guardar login, roles y permisos antes de los arreglos del backend".
