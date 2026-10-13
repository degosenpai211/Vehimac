ROLE_ADMIN = "admin"
ROLE_CO_ADMIN = "co_admin"
APP_ROLES = (ROLE_ADMIN, ROLE_CO_ADMIN)

PERMISSION_FINANZAS_VER = "finanzas.ver"
PERMISSION_CUENTA_EDITAR = "cuenta.editar"
PERMISSION_USUARIOS_GESTIONAR = "usuarios.gestionar"

ROLE_PERMISSIONS = {
    ROLE_ADMIN: frozenset(
        {PERMISSION_FINANZAS_VER, PERMISSION_CUENTA_EDITAR, PERMISSION_USUARIOS_GESTIONAR}
    ),
    ROLE_CO_ADMIN: frozenset({PERMISSION_CUENTA_EDITAR}),
}

PUBLIC_EXACT_PATHS = frozenset(
    {
        "/",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/api/auth/status",
        "/api/auth/bootstrap",
    }
)
PUBLIC_PATH_PREFIXES = ("/api/p/",)
JOIN_REQUEST_PATH = "/api/auth/join-requests"


def is_app_role(role: str | None) -> bool:
    return role in APP_ROLES


def has_permission(role: str | None, permission: str) -> bool:
    granted = ROLE_PERMISSIONS.get(role or "", frozenset())
    return permission in granted


def is_public_path(path: str) -> bool:
    if path in PUBLIC_EXACT_PATHS:
        return True
    return any(path == prefix or path.startswith(prefix) for prefix in PUBLIC_PATH_PREFIXES)


def is_join_request_post(path: str, method: str) -> bool:
    if method.upper() != "POST":
        return False
    return path.rstrip("/") == JOIN_REQUEST_PATH
