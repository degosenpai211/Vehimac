from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.accounts import (
    AccountUpdate,
    InviteRequest,
    JoinApproval,
    OwnerDraft,
    approve_join,
    bootstrap_owners,
    invite_account,
    list_join_requests,
    reject_join,
    request_join,
    update_account,
)
from app.auth.deps import get_auth_identity, get_current_user, raise_auth_http, require_permission
from app.auth.errors import AuthError
from app.auth.permissions import PERMISSION_USUARIOS_GESTIONAR
from app.auth.store import list_accounts, needs_bootstrap
from app.auth.user import AuthIdentity, AuthUser

router = APIRouter(prefix="/auth", tags=["Auth"])


class InviteBody(BaseModel):
    email: str
    name: str
    role: str


class AccountPatchBody(BaseModel):
    active: bool | None = None
    role: str | None = None


class OwnerBody(BaseModel):
    name: str
    email: str
    password: str


class BootstrapBody(BaseModel):
    owner: OwnerBody
    developer: OwnerBody


class ApproveJoinBody(BaseModel):
    role: str
    password: str
    name: str | None = None


@router.get("/status")
def status():
    try:
        return {"needs_bootstrap": needs_bootstrap()}
    except AuthError as error:
        raise_auth_http(error)


@router.post("/bootstrap")
def bootstrap(body: BootstrapBody):
    try:
        bootstrap_owners(
            OwnerDraft(name=body.owner.name, email=body.owner.email, password=body.owner.password),
            OwnerDraft(
                name=body.developer.name,
                email=body.developer.email,
                password=body.developer.password,
            ),
        )
        return {"ok": True}
    except AuthError as error:
        raise_auth_http(error)


@router.get("/me")
def me(user: AuthUser = Depends(get_current_user)):
    return user.to_public()


@router.get("/users")
def users(_admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR))):
    try:
        return list_accounts()
    except AuthError as error:
        raise_auth_http(error)


@router.post("/users")
def create_user(
    body: InviteBody,
    _admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR)),
):
    try:
        return invite_account(InviteRequest(email=body.email, name=body.name, role=body.role))
    except AuthError as error:
        raise_auth_http(error)


@router.patch("/users/{user_id}")
def patch_user(
    user_id: str,
    body: AccountPatchBody,
    admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR)),
):
    try:
        return update_account(
            admin,
            AccountUpdate(user_id=user_id, active=body.active, role=body.role),
        )
    except AuthError as error:
        raise_auth_http(error)


@router.post("/join-requests")
def create_join_request(identity: AuthIdentity = Depends(get_auth_identity)):
    try:
        return request_join(identity)
    except AuthError as error:
        raise_auth_http(error)


@router.get("/join-requests")
def pending_join_requests(
    _admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR)),
):
    try:
        return list_join_requests()
    except AuthError as error:
        raise_auth_http(error)


@router.post("/join-requests/{user_id}/approve")
def approve_join_request(
    user_id: str,
    body: ApproveJoinBody,
    _admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR)),
):
    try:
        return approve_join(
            JoinApproval(user_id=user_id, role=body.role, password=body.password, name=body.name),
        )
    except AuthError as error:
        raise_auth_http(error)


@router.post("/join-requests/{user_id}/reject")
def reject_join_request(
    user_id: str,
    _admin: AuthUser = Depends(require_permission(PERMISSION_USUARIOS_GESTIONAR)),
):
    try:
        return reject_join(user_id)
    except AuthError as error:
        raise_auth_http(error)
