from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.auth.deps import IDENTITY_STATE_ATTR, USER_STATE_ATTR
from app.auth.errors import AuthError
from app.auth.permissions import is_join_request_post, is_public_path
from app.auth.store import auth_identity_from_token, auth_user_from_token

BEARER_PREFIX = "Bearer "


def access_token_from_request(request: Request) -> str:
    header = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not header.startswith(BEARER_PREFIX):
        return ""
    return header[len(BEARER_PREFIX) :].strip()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or is_public_path(request.url.path):
            return await call_next(request)
        token = access_token_from_request(request)
        if not token:
            return JSONResponse({"detail": "Tenés que iniciar sesión"}, status_code=401)
        try:
            if is_join_request_post(request.url.path, request.method):
                setattr(request.state, IDENTITY_STATE_ATTR, auth_identity_from_token(token))
                return await call_next(request)
            setattr(request.state, USER_STATE_ATTR, auth_user_from_token(token))
        except AuthError as error:
            return JSONResponse({"detail": error.message}, status_code=error.status_code)
        except HTTPException as error:
            return JSONResponse({"detail": error.detail}, status_code=error.status_code)
        return await call_next(request)
