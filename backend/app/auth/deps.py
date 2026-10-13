from fastapi import Depends, HTTPException, Request

from app.auth.errors import AuthError
from app.auth.permissions import has_permission
from app.auth.user import AuthIdentity, AuthUser

USER_STATE_ATTR = "auth_user"
IDENTITY_STATE_ATTR = "auth_identity"


def get_current_user(request: Request) -> AuthUser:
    user = getattr(request.state, USER_STATE_ATTR, None)
    if user is None:
        raise HTTPException(status_code=401, detail="Tenés que iniciar sesión")
    return user


def get_auth_identity(request: Request) -> AuthIdentity:
    identity = getattr(request.state, IDENTITY_STATE_ATTR, None)
    if identity is None:
        raise HTTPException(status_code=401, detail="Tenés que iniciar sesión")
    return identity


def require_permission(permission: str):
    def checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if not has_permission(user.role, permission):
            raise HTTPException(status_code=403, detail="No tenés acceso a esta sección")
        return user

    return checker


def raise_auth_http(error: AuthError) -> None:
    raise HTTPException(status_code=error.status_code, detail=error.message)
