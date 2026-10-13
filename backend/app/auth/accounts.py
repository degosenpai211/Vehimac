from dataclasses import dataclass

from app.auth.errors import AuthError
from app.auth.permissions import ROLE_ADMIN, is_app_role
from app.auth.store import (
    JOIN_STATUS_APPROVED,
    JOIN_STATUS_PENDING,
    JOIN_STATUS_REJECTED,
    count_active_admins,
    delete_profile,
    emails_by_user_id,
    insert_join_request,
    insert_profile,
    invite_auth_user,
    list_accounts,
    list_pending_join_requests,
    load_join_request,
    load_profile,
    mark_join_request,
    public_account,
    public_join_request,
    reopen_join_request,
    save_owner_pair,
    set_auth_password,
    update_profile,
)
from app.auth.user import AuthIdentity, AuthUser

NAME_MAX_LENGTH = 80
EMAIL_MIN_LENGTH = 6
MIN_PASSWORD_LENGTH = 8


@dataclass(frozen=True)
class InviteRequest:
    email: str
    name: str
    role: str


@dataclass(frozen=True)
class ActiveChange:
    actor_id: str
    target_id: str
    target_role: str
    active_admin_count: int
    going_active: bool


def normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if len(email) < EMAIL_MIN_LENGTH or "@" not in email:
        raise AuthError("El correo no es válido.", 400)
    domain = email.rsplit("@", 1)[-1]
    if "." not in domain or domain.startswith(".") or domain.endswith("."):
        raise AuthError("El correo no es válido.", 400)
    return email


def normalize_name(value: str) -> str:
    name = " ".join((value or "").split())
    if not name:
        raise AuthError("El nombre no puede estar vacío.", 400)
    if len(name) > NAME_MAX_LENGTH:
        raise AuthError("El nombre es demasiado largo.", 400)
    return name


def require_password(value: str) -> str:
    if not value or len(value) < MIN_PASSWORD_LENGTH:
        raise AuthError(
            f"La clave tiene que tener al menos {MIN_PASSWORD_LENGTH} caracteres.",
            400,
        )
    return value


@dataclass(frozen=True)
class OwnerDraft:
    name: str
    email: str
    password: str


def owner_from_draft(draft: OwnerDraft) -> dict:
    return {
        "name": normalize_name(draft.name),
        "email": normalize_email(draft.email),
        "password": require_password(draft.password),
    }


def guard_distinct_owner_emails(owner_email: str, developer_email: str) -> None:
    if owner_email == developer_email:
        raise AuthError("Dueño y programador tienen que usar correos distintos.", 400)


def can_bootstrap(existing_profiles: int) -> bool:
    return existing_profiles == 0


def bootstrap_owners(owner: OwnerDraft, developer: OwnerDraft) -> None:
    left = owner_from_draft(owner)
    right = owner_from_draft(developer)
    guard_distinct_owner_emails(left["email"], right["email"])
    save_owner_pair(left, right)


def require_app_role(role: str) -> str:
    if not is_app_role(role):
        raise AuthError("El rol no es válido.", 400)
    return role


def guard_active_change(change: ActiveChange) -> None:
    if change.going_active:
        return
    if change.actor_id == change.target_id:
        raise AuthError("No podés desactivar tu propia cuenta.", 400)
    if change.target_role == ROLE_ADMIN and change.active_admin_count <= 1:
        raise AuthError("Tiene que quedar al menos un administrador.", 400)


@dataclass(frozen=True)
class RoleChange:
    current_role: str
    new_role: str
    target_active: bool
    active_admin_count: int


def guard_role_change(change: RoleChange) -> None:
    if change.current_role == change.new_role:
        return
    require_app_role(change.new_role)
    losing_admin = (
        change.current_role == ROLE_ADMIN
        and change.new_role != ROLE_ADMIN
        and change.target_active
    )
    if losing_admin and change.active_admin_count <= 1:
        raise AuthError("Tiene que quedar al menos un administrador.", 400)


def invite_account(payload: InviteRequest) -> dict:
    email = normalize_email(payload.email)
    name = normalize_name(payload.name)
    role = require_app_role(payload.role)
    for row in list_accounts():
        if row["email"] == email:
            raise AuthError("Ese correo ya tiene acceso.", 400)
    user = invite_auth_user(email, name)
    user_id = str(user.id)
    if load_profile(user_id):
        raise AuthError("Ese correo ya tiene acceso.", 400)
    profile = insert_profile(user_id, name, role)
    return public_account(profile, email)


@dataclass(frozen=True)
class AccountUpdate:
    user_id: str
    active: bool | None
    role: str | None


def update_account(actor: AuthUser, change: AccountUpdate) -> dict:
    if change.active is None and change.role is None:
        raise AuthError("No hay nada para actualizar.", 400)
    profile = load_profile(change.user_id)
    if not profile:
        raise AuthError("No encontramos esa cuenta.", 404)
    current_role = profile.get("rol") or ""
    current_active = bool(profile.get("activo", True))
    admin_count = count_active_admins()
    fields = {}
    if change.active is not None:
        guard_active_change(
            ActiveChange(
                actor_id=actor.id,
                target_id=change.user_id,
                target_role=current_role,
                active_admin_count=admin_count,
                going_active=change.active,
            )
        )
        fields["activo"] = change.active
    if change.role is not None:
        next_role = require_app_role(change.role)
        guard_role_change(
            RoleChange(
                current_role=current_role,
                new_role=next_role,
                target_active=current_active,
                active_admin_count=admin_count,
            )
        )
        fields["rol"] = next_role
    updated = update_profile(change.user_id, fields)
    emails = emails_by_user_id()
    user_id = str(updated.get("user_id") or change.user_id)
    return public_account(updated, emails.get(user_id, ""))


JOIN_STATUS_READY = "ready"
JOIN_STATUS_DISABLED = "disabled"


def request_join(identity: AuthIdentity) -> dict:
    profile = load_profile(identity.id)
    if profile:
        if not profile.get("activo", True):
            return {"status": JOIN_STATUS_DISABLED}
        return {"status": JOIN_STATUS_READY}
    name = normalize_name(identity.name)
    email = normalize_email(identity.email)
    existing = load_join_request(identity.id)
    if not existing:
        row = insert_join_request(identity.id, name, email)
        return {"status": JOIN_STATUS_PENDING, **row}
    current = existing.get("estado")
    if current == JOIN_STATUS_PENDING:
        return {"status": JOIN_STATUS_PENDING, **public_join_request(existing)}
    if current == JOIN_STATUS_APPROVED:
        return {"status": JOIN_STATUS_READY}
    row = reopen_join_request(identity.id, name, email)
    return {"status": JOIN_STATUS_PENDING, **row}


def list_join_requests() -> list[dict]:
    return list_pending_join_requests()


@dataclass(frozen=True)
class JoinApproval:
    user_id: str
    role: str
    password: str
    name: str | None


def approve_join(approval: JoinApproval) -> dict:
    role = require_app_role(approval.role)
    password = require_password(approval.password)
    pending = load_join_request(approval.user_id)
    if not pending or pending.get("estado") != JOIN_STATUS_PENDING:
        raise AuthError("No hay un pedido pendiente para esa persona.", 404)
    if load_profile(approval.user_id):
        raise AuthError("Esa persona ya tiene acceso.", 400)
    name = normalize_name(approval.name or pending.get("nombre") or "")
    email = normalize_email(pending.get("email") or "")
    profile = insert_profile(approval.user_id, name, role)
    try:
        set_auth_password(approval.user_id, password)
        mark_join_request(approval.user_id, JOIN_STATUS_APPROVED)
    except AuthError:
        delete_profile(approval.user_id)
        raise
    return public_account(profile, email)


def reject_join(user_id: str) -> dict:
    pending = load_join_request(user_id)
    if not pending or pending.get("estado") != JOIN_STATUS_PENDING:
        raise AuthError("No hay un pedido pendiente para esa persona.", 404)
    return mark_join_request(user_id, JOIN_STATUS_REJECTED)

