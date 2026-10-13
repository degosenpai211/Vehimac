"""Login con la contraseña del taller y token firmado (HMAC-SHA256).

Si APP_PASSWORD no está cargada la API queda abierta, como antes: así el
deploy no deja al taller afuera antes de poner la variable en Railway.
"""
import hashlib
import hmac
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger("vehimac.auth")

router = APIRouter(prefix="/auth", tags=["Auth"])
_bearer = HTTPBearer(auto_error=False, description="Token de POST /api/auth/login")

MAX_FAILED = 8
FAILED_WINDOW = 10 * 60

_failed: dict[str, list[float]] = {}


class LoginBody(BaseModel):
    password: str


def auth_enabled() -> bool:
    return bool(settings.app_password)


def _secret() -> bytes:
    # Sin AUTH_SECRET se deriva de la contraseña: cambiarla cierra todas las sesiones.
    base = settings.auth_secret or f"vehimac-auth:{settings.app_password}"
    return hashlib.sha256(base.encode()).digest()


def _sign(expires_at: int) -> str:
    return hmac.new(_secret(), str(expires_at).encode(), hashlib.sha256).hexdigest()


def create_token(now: float | None = None) -> tuple[str, int]:
    now = time.time() if now is None else now
    expires_at = int(now) + settings.auth_token_days * 86400
    return f"{expires_at}.{_sign(expires_at)}", expires_at


def token_is_valid(token: str, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    expires_raw, _, signature = token.partition(".")
    if not expires_raw.isdigit() or not signature:
        return False
    expires_at = int(expires_raw)
    if not hmac.compare_digest(signature, _sign(expires_at)):
        return False
    return expires_at > now


def require_auth(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    if not auth_enabled():
        return
    if credentials is None or not token_is_valid(credentials.credentials):
        raise HTTPException(
            status_code=401,
            detail="Iniciá sesión para continuar",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _recent_failures(key: str, now: float) -> list[float]:
    recent = [t for t in _failed.get(key, []) if now - t < FAILED_WINDOW]
    if recent:
        _failed[key] = recent
    else:
        _failed.pop(key, None)
    return recent


@router.get("/status")
def auth_status():
    return {"auth_required": auth_enabled()}


@router.post("/login")
def login(body: LoginBody, request: Request):
    if not auth_enabled():
        raise HTTPException(status_code=400, detail="La API no tiene contraseña configurada")

    key = request.client.host if request.client else "desconocido"
    now = time.time()
    if len(_recent_failures(key, now)) >= MAX_FAILED:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Probá de nuevo en unos minutos.")

    if not hmac.compare_digest(body.password.encode(), settings.app_password.encode()):
        _failed.setdefault(key, []).append(now)
        logger.warning("Login fallido desde %s", key)
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")

    _failed.pop(key, None)
    token, expires_at = create_token(now)
    return {"token": token, "expires_at": expires_at}


@router.get("/me", dependencies=[Depends(require_auth)])
def me():
    return {"ok": True}
