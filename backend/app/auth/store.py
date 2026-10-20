from datetime import datetime, timezone
from threading import Lock
from time import monotonic

from app.auth.errors import AuthError
from app.auth.permissions import ROLE_ADMIN, is_app_role
from app.auth.user import AuthIdentity, AuthUser
from app.config import settings
from app.database import get_supabase

PROFILES_TABLE = "perfiles_usuario"
JOIN_TABLE = "solicitudes_acceso"
MISSING_TABLE_HINT = "Falló. Reiniciá e intentá otra vez."
MISSING_JOIN_TABLE_HINT = "Falló. Reiniciá e intentá otra vez."
RECOVERY_PATH = "/recuperar-clave"
JOIN_STATUS_PENDING = "pendiente"
JOIN_STATUS_APPROVED = "aprobada"
JOIN_STATUS_REJECTED = "rechazada"
MUST_LOGIN_MESSAGE = "Tenés que iniciar sesión"
SESSION_CHECK_FAILED = "No hay conexión. Probá de nuevo."
VERIFY_CACHE_SECONDS = 60
LOGOUT_HINTS = ("invalid jwt", "jwt expired", "invalid claim", "bad_jwt")
_verified_users: dict[str, tuple[float, AuthUser]] = {}
_cache_lock = Lock()


def load_profile(user_id: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(PROFILES_TABLE)
            .select("user_id, rol, nombre, activo")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise AuthError(MISSING_TABLE_HINT, 500) from exc
    rows = result.data or []
    if not rows:
        return {}
    return rows[0]


def error_for_user_lookup(exc: Exception) -> AuthError:
    status = getattr(exc, "status", None)
    text = str(exc).lower()
    if status in (401, 403) or any(hint in text for hint in LOGOUT_HINTS):
        return AuthError(MUST_LOGIN_MESSAGE, 401)
    return AuthError(SESSION_CHECK_FAILED, 503)


def _cached_auth_user(access_token: str) -> AuthUser | None:
    with _cache_lock:
        cached = _verified_users.get(access_token)
    if not cached:
        return None
    saved_at, user = cached
    if monotonic() - saved_at > VERIFY_CACHE_SECONDS:
        return None
    return user


def _remember_auth_user(access_token: str, user: AuthUser) -> None:
    with _cache_lock:
        _verified_users[access_token] = (monotonic(), user)
        if len(_verified_users) <= 32:
            return
        oldest = min(_verified_users, key=lambda token: _verified_users[token][0])
        _verified_users.pop(oldest, None)


def _load_auth_user(access_token: str):
    try:
        response = get_supabase().auth.get_user(access_token)
    except Exception as exc:
        raise error_for_user_lookup(exc) from exc
    auth_user = getattr(response, "user", None)
    if auth_user is None:
        raise AuthError(MUST_LOGIN_MESSAGE, 401)
    return auth_user


def display_name_from_auth_user(auth_user) -> str:
    meta = getattr(auth_user, "user_metadata", None) or {}
    if not isinstance(meta, dict):
        meta = {}
    for key in ("nombre", "full_name", "name"):
        value = str(meta.get(key) or "").strip()
        if value:
            return value
    email = (getattr(auth_user, "email", None) or "").strip()
    local_part = email.split("@")[0].strip()
    return local_part or email or "Sin nombre"


def auth_identity_from_token(access_token: str) -> AuthIdentity:
    auth_user = _load_auth_user(access_token)
    email = (getattr(auth_user, "email", None) or "").strip().lower()
    if not email:
        raise AuthError("Esa cuenta de Google no trae correo.", 400)
    return AuthIdentity(
        id=str(auth_user.id),
        email=email,
        name=display_name_from_auth_user(auth_user),
    )


def auth_user_from_token(access_token: str) -> AuthUser:
    cached = _cached_auth_user(access_token)
    if cached is not None:
        return cached
    auth_user = _load_auth_user(access_token)
    user_id = str(auth_user.id)
    email = (getattr(auth_user, "email", None) or "").strip().lower()
    profile = load_profile(user_id)
    if not profile:
        raise AuthError(
            "No hay un perfil para este correo. Pedile a un administrador que te habilite.",
            403,
        )
    if not profile.get("activo", True):
        raise AuthError("Tu cuenta está desactivada.", 403)
    role = profile.get("rol") or ""
    if not is_app_role(role):
        raise AuthError("Tu perfil tiene un rol inválido.", 403)
    user = AuthUser(
        id=user_id,
        email=email,
        name=(profile.get("nombre") or "").strip() or email,
        role=role,
        active=True,
    )
    _remember_auth_user(access_token, user)
    return user


def list_profiles() -> list[dict]:
    try:
        result = (
            get_supabase()
            .table(PROFILES_TABLE)
            .select("user_id, rol, nombre, activo")
            .order("nombre")
            .execute()
        )
    except Exception as exc:
        raise AuthError(MISSING_TABLE_HINT, 500) from exc
    return result.data or []


def emails_by_user_id() -> dict[str, str]:
    try:
        users = get_supabase().auth.admin.list_users()
    except Exception as exc:
        raise AuthError("No se pudieron leer las cuentas de acceso.", 500) from exc
    mapping = {}
    for user in users or []:
        mapping[str(user.id)] = (getattr(user, "email", None) or "").strip().lower()
    return mapping


def public_account(profile: dict, email: str) -> dict:
    return {
        "id": str(profile.get("user_id") or ""),
        "email": email,
        "name": (profile.get("nombre") or "").strip(),
        "role": profile.get("rol"),
        "active": bool(profile.get("activo", True)),
    }


def list_accounts() -> list[dict]:
    emails = emails_by_user_id()
    rows = []
    for profile in list_profiles():
        user_id = str(profile.get("user_id") or "")
        rows.append(public_account(profile, emails.get(user_id, "")))
    return rows


def count_active_admins() -> int:
    return sum(
        1
        for profile in list_profiles()
        if profile.get("rol") == ROLE_ADMIN and profile.get("activo", True)
    )


def profile_count() -> int:
    try:
        result = (
            get_supabase()
            .table(PROFILES_TABLE)
            .select("user_id", count="exact")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise AuthError(MISSING_TABLE_HINT, 500) from exc
    return int(result.count or 0)


def needs_bootstrap() -> bool:
    return profile_count() == 0


def _create_user_message(exc: Exception) -> str:
    text = str(exc).lower()
    if _already_registered(exc):
        return "Ese correo ya tiene una cuenta en Authentication."
    if "password" in text:
        return "La clave no sirve. Probá con otra."
    return "No se pudo crear la cuenta."


def create_confirmed_auth_user(email: str, password: str, name: str):
    try:
        response = get_supabase().auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"nombre": name},
            }
        )
    except Exception as exc:
        raise AuthError(_create_user_message(exc), 400) from exc
    user = getattr(response, "user", None)
    if user is None:
        raise AuthError("No se pudo crear la cuenta.", 400)
    return user


def delete_auth_user(user_id: str) -> None:
    try:
        get_supabase().auth.admin.delete_user(user_id)
    except Exception as exc:
        raise AuthError(
            "Falló. Probá de nuevo.",
            500,
        ) from exc


def save_owner_pair(owner: dict, developer: dict) -> None:
    if profile_count() > 0:
        raise AuthError("El ERP ya tiene administradores.", 403)
    first = create_confirmed_auth_user(owner["email"], owner["password"], owner["name"])
    try:
        second = create_confirmed_auth_user(
            developer["email"], developer["password"], developer["name"]
        )
    except AuthError:
        delete_auth_user(str(first.id))
        raise
    try:
        insert_profile(str(first.id), owner["name"], ROLE_ADMIN)
        insert_profile(str(second.id), developer["name"], ROLE_ADMIN)
    except AuthError:
        delete_auth_user(str(first.id))
        delete_auth_user(str(second.id))
        raise


def insert_profile(user_id: str, name: str, role: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(PROFILES_TABLE)
            .insert({"user_id": user_id, "nombre": name, "rol": role, "activo": True})
            .execute()
        )
    except Exception as exc:
        raise AuthError("No se pudo guardar el perfil de acceso.", 500) from exc
    rows = result.data or []
    if not rows:
        raise AuthError("No se pudo guardar el perfil de acceso.", 500)
    return rows[0]


def update_profile(user_id: str, fields: dict) -> dict:
    if not fields:
        raise AuthError("No hay nada para actualizar.", 400)
    try:
        result = (
            get_supabase()
            .table(PROFILES_TABLE)
            .update(fields)
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        raise AuthError("No se pudo actualizar la cuenta.", 500) from exc
    rows = result.data or []
    if not rows:
        raise AuthError("No encontramos esa cuenta.", 404)
    return rows[0]


def _already_registered(exc: Exception) -> bool:
    text = str(exc).lower()
    return "already" in text or "registered" in text or "exists" in text


def _invite_message(exc: Exception) -> str:
    text = str(exc).lower()
    if "rate" in text:
        return "Demasiadas invitaciones seguidas. Probá en un rato."
    if "smtp" in text or "email" in text and "send" in text:
        return "No se pudo enviar el correo. Probá más tarde."
    return "No se pudo enviar la invitación."


def _auth_user_with_email(email: str):
    for user in get_supabase().auth.admin.list_users() or []:
        if (getattr(user, "email", None) or "").strip().lower() == email:
            return user
    return None


def invite_auth_user(email: str, name: str):
    redirect = f"{settings.public_app_url.rstrip('/')}{RECOVERY_PATH}"
    admin = get_supabase().auth.admin
    try:
        response = admin.invite_user_by_email(
            email,
            {"redirect_to": redirect, "data": {"nombre": name}},
        )
        user = getattr(response, "user", None)
        if user is not None:
            return user
    except Exception as exc:
        if not _already_registered(exc):
            raise AuthError(_invite_message(exc), 400) from exc
        user = _auth_user_with_email(email)
        if user is None:
            raise AuthError("Ese correo ya existe, pero no se pudo leer la cuenta.", 400) from exc
        return user
    raise AuthError("No se pudo crear la invitación.", 400)


def public_join_request(row: dict) -> dict:
    return {
        "id": str(row.get("user_id") or ""),
        "email": (row.get("email") or "").strip().lower(),
        "name": (row.get("nombre") or "").strip(),
        "status": row.get("estado"),
        "created_at": row.get("created_at"),
    }


def load_join_request(user_id: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(JOIN_TABLE)
            .select("user_id, email, nombre, estado, created_at, resolved_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise AuthError(MISSING_JOIN_TABLE_HINT, 500) from exc
    rows = result.data or []
    if not rows:
        return {}
    return rows[0]


def list_pending_join_requests() -> list[dict]:
    try:
        result = (
            get_supabase()
            .table(JOIN_TABLE)
            .select("user_id, email, nombre, estado, created_at")
            .eq("estado", JOIN_STATUS_PENDING)
            .order("created_at")
            .execute()
        )
    except Exception as exc:
        raise AuthError(MISSING_JOIN_TABLE_HINT, 500) from exc
    return [public_join_request(row) for row in (result.data or [])]


def insert_join_request(user_id: str, name: str, email: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(JOIN_TABLE)
            .insert(
                {
                    "user_id": user_id,
                    "nombre": name,
                    "email": email,
                    "estado": JOIN_STATUS_PENDING,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise AuthError("No se pudo guardar el pedido de acceso.", 500) from exc
    rows = result.data or []
    if not rows:
        raise AuthError("No se pudo guardar el pedido de acceso.", 500)
    return public_join_request(rows[0])


def reopen_join_request(user_id: str, name: str, email: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(JOIN_TABLE)
            .update(
                {
                    "nombre": name,
                    "email": email,
                    "estado": JOIN_STATUS_PENDING,
                    "resolved_at": None,
                }
            )
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        raise AuthError("No se pudo actualizar el pedido de acceso.", 500) from exc
    rows = result.data or []
    if not rows:
        raise AuthError("No encontramos ese pedido de acceso.", 404)
    return public_join_request(rows[0])


def mark_join_request(user_id: str, status: str) -> dict:
    try:
        result = (
            get_supabase()
            .table(JOIN_TABLE)
            .update({"estado": status, "resolved_at": datetime.now(timezone.utc).isoformat()})
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        raise AuthError("No se pudo actualizar el pedido de acceso.", 500) from exc
    rows = result.data or []
    if not rows:
        raise AuthError("No encontramos ese pedido de acceso.", 404)
    return public_join_request(rows[0])


def delete_profile(user_id: str) -> None:
    try:
        get_supabase().table(PROFILES_TABLE).delete().eq("user_id", user_id).execute()
    except Exception as exc:
        raise AuthError("No se pudo deshacer el perfil a medias.", 500) from exc


def set_auth_password(user_id: str, password: str) -> None:
    try:
        get_supabase().auth.admin.update_user_by_id(user_id, {"password": password})
    except Exception as exc:
        raise AuthError("No se pudo guardar la clave de esa cuenta.", 500) from exc
