from unittest import TestCase, main

from app.auth.permissions import (
    PERMISSION_CUENTA_EDITAR,
    PERMISSION_FINANZAS_VER,
    PERMISSION_USUARIOS_GESTIONAR,
    ROLE_ADMIN,
    ROLE_CO_ADMIN,
    has_permission,
    is_app_role,
    is_public_path,
)
from app.auth.user import AuthUser


class PermissionTests(TestCase):
    def test_admin_can_see_finances(self):
        self.assertTrue(has_permission(ROLE_ADMIN, PERMISSION_FINANZAS_VER))
        self.assertTrue(has_permission(ROLE_ADMIN, PERMISSION_CUENTA_EDITAR))
        self.assertTrue(has_permission(ROLE_ADMIN, PERMISSION_USUARIOS_GESTIONAR))

    def test_co_admin_cannot_see_finances(self):
        self.assertFalse(has_permission(ROLE_CO_ADMIN, PERMISSION_FINANZAS_VER))
        self.assertTrue(has_permission(ROLE_CO_ADMIN, PERMISSION_CUENTA_EDITAR))
        self.assertFalse(has_permission(ROLE_CO_ADMIN, PERMISSION_USUARIOS_GESTIONAR))

    def test_unknown_role_has_no_permissions(self):
        self.assertFalse(has_permission("mechanic", PERMISSION_FINANZAS_VER))
        self.assertFalse(has_permission(None, PERMISSION_FINANZAS_VER))
        self.assertFalse(has_permission("", PERMISSION_CUENTA_EDITAR))

    def test_app_roles(self):
        self.assertTrue(is_app_role(ROLE_ADMIN))
        self.assertTrue(is_app_role(ROLE_CO_ADMIN))
        self.assertFalse(is_app_role("administrativo"))
        self.assertFalse(is_app_role("mechanic"))
        self.assertFalse(is_app_role("supervisor"))


class PublicPathTests(TestCase):
    def test_health_and_docs_are_public(self):
        self.assertTrue(is_public_path("/health"))
        self.assertTrue(is_public_path("/"))
        self.assertTrue(is_public_path("/docs"))
        self.assertTrue(is_public_path("/openapi.json"))

    def test_public_proforma_link(self):
        self.assertTrue(is_public_path("/api/p/abc123"))
        self.assertTrue(is_public_path("/api/p/"))

    def test_protected_api_paths(self):
        self.assertTrue(is_public_path("/api/auth/status"))
        self.assertTrue(is_public_path("/api/auth/bootstrap"))
        self.assertFalse(is_public_path("/api/auth/users"))
        self.assertFalse(is_public_path("/api/auth/me"))
        self.assertFalse(is_public_path("/api/auth/join-requests"))
        self.assertFalse(is_public_path("/api/finances"))
        self.assertFalse(is_public_path("/api/dashboard/stats"))
        self.assertFalse(is_public_path("/api/dashboard/finance-kpis"))
        self.assertFalse(is_public_path("/api/work-orders"))

    def test_join_request_post_is_identity_only(self):
        from app.auth.permissions import is_join_request_post

        self.assertTrue(is_join_request_post("/api/auth/join-requests", "POST"))
        self.assertTrue(is_join_request_post("/api/auth/join-requests/", "POST"))
        self.assertFalse(is_join_request_post("/api/auth/join-requests", "GET"))
        self.assertFalse(is_join_request_post("/api/auth/join-requests/abc/approve", "POST"))
        self.assertFalse(is_join_request_post("/api/auth/users", "POST"))


class AuthUserTests(TestCase):
    def test_public_payload(self):
        user = AuthUser(
            id="1",
            email="ana@taller.bo",
            name="Ana",
            role=ROLE_ADMIN,
            active=True,
        )
        self.assertEqual(
            user.to_public(),
            {
                "id": "1",
                "email": "ana@taller.bo",
                "name": "Ana",
                "role": ROLE_ADMIN,
                "active": True,
            },
        )


class InviteValidationTests(TestCase):
    def test_normalize_email(self):
        from app.auth.accounts import normalize_email
        from app.auth.errors import AuthError

        self.assertEqual(normalize_email("  Ana@Taller.BO "), "ana@taller.bo")
        with self.assertRaises(AuthError):
            normalize_email("sin-arroba")
        with self.assertRaises(AuthError):
            normalize_email("")

    def test_normalize_name(self):
        from app.auth.accounts import normalize_name
        from app.auth.errors import AuthError

        self.assertEqual(normalize_name("  María   López "), "María López")
        with self.assertRaises(AuthError):
            normalize_name("   ")

    def test_cannot_deactivate_self(self):
        from app.auth.accounts import ActiveChange, guard_active_change
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            guard_active_change(
                ActiveChange(
                    actor_id="1",
                    target_id="1",
                    target_role=ROLE_ADMIN,
                    active_admin_count=3,
                    going_active=False,
                )
            )

    def test_cannot_drop_last_admin(self):
        from app.auth.accounts import ActiveChange, guard_active_change
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            guard_active_change(
                ActiveChange(
                    actor_id="1",
                    target_id="2",
                    target_role=ROLE_ADMIN,
                    active_admin_count=1,
                    going_active=False,
                )
            )

    def test_can_deactivate_other_admin_when_another_remains(self):
        from app.auth.accounts import ActiveChange, guard_active_change

        guard_active_change(
            ActiveChange(
                actor_id="1",
                target_id="2",
                target_role=ROLE_ADMIN,
                active_admin_count=2,
                going_active=False,
            )
        )

    def test_cannot_demote_last_admin(self):
        from app.auth.accounts import RoleChange, guard_role_change
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            guard_role_change(
                RoleChange(
                    current_role=ROLE_ADMIN,
                    new_role=ROLE_CO_ADMIN,
                    target_active=True,
                    active_admin_count=1,
                )
            )

    def test_can_promote_co_admin(self):
        from app.auth.accounts import RoleChange, guard_role_change

        guard_role_change(
            RoleChange(
                current_role=ROLE_CO_ADMIN,
                new_role=ROLE_ADMIN,
                target_active=True,
                active_admin_count=1,
            )
        )

    def test_can_demote_admin_when_another_remains(self):
        from app.auth.accounts import RoleChange, guard_role_change

        guard_role_change(
            RoleChange(
                current_role=ROLE_ADMIN,
                new_role=ROLE_CO_ADMIN,
                target_active=True,
                active_admin_count=2,
            )
        )

    def test_rejects_invalid_role(self):
        from app.auth.accounts import RoleChange, guard_role_change
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            guard_role_change(
                RoleChange(
                    current_role=ROLE_CO_ADMIN,
                    new_role="mechanic",
                    target_active=True,
                    active_admin_count=1,
                )
            )

    def test_bootstrap_needs_empty_profiles(self):
        from app.auth.accounts import can_bootstrap

        self.assertTrue(can_bootstrap(0))
        self.assertFalse(can_bootstrap(1))
        self.assertFalse(can_bootstrap(2))

    def test_owners_need_distinct_emails(self):
        from app.auth.accounts import guard_distinct_owner_emails
        from app.auth.errors import AuthError

        guard_distinct_owner_emails("ana@taller.bo", "dev@taller.bo")
        with self.assertRaises(AuthError):
            guard_distinct_owner_emails("ana@taller.bo", "ana@taller.bo")

    def test_password_too_short(self):
        from app.auth.accounts import require_password
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            require_password("corta")
        self.assertEqual(require_password("secreto1"), "secreto1")

    def test_approve_join_rejects_short_password(self):
        from app.auth.accounts import JoinApproval, approve_join
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            approve_join(
                JoinApproval(
                    user_id="1",
                    role=ROLE_CO_ADMIN,
                    password="corta",
                    name="Ana",
                )
            )

    def test_approve_join_rejects_invalid_role(self):
        from app.auth.accounts import JoinApproval, approve_join
        from app.auth.errors import AuthError

        with self.assertRaises(AuthError):
            approve_join(
                JoinApproval(
                    user_id="1",
                    role="mechanic",
                    password="secreto1",
                    name="Ana",
                )
            )

    def test_network_blip_does_not_look_like_logout(self):
        from app.auth.store import error_for_user_lookup

        class DroppedConnection(Exception):
            pass

        error = error_for_user_lookup(DroppedConnection("[WinError 10054]"))
        self.assertEqual(error.status_code, 503)
        self.assertNotIn("iniciar sesión", error.message)

    def test_invalid_jwt_still_requires_login(self):
        from app.auth.store import error_for_user_lookup

        class InvalidJwt(Exception):
            status = 401

        error = error_for_user_lookup(InvalidJwt("invalid jwt"))
        self.assertEqual(error.status_code, 401)

    def test_google_display_name(self):
        from app.auth.store import display_name_from_auth_user

        class GoogleUser:
            email = "ana@gmail.com"
            user_metadata = {"full_name": "Ana López"}

        class EmailOnlyUser:
            email = "dev@taller.bo"
            user_metadata = {}

        self.assertEqual(display_name_from_auth_user(GoogleUser()), "Ana López")
        self.assertEqual(display_name_from_auth_user(EmailOnlyUser()), "dev")


class DashboardKpiSplitTests(TestCase):
    def test_workshop_kpis_omit_money(self):
        from datetime import date
        from app.routers.dashboard import _workshop_kpis

        kpis = _workshop_kpis([], [], date(2026, 9, 29))
        self.assertNotIn("income_today", kpis)
        self.assertEqual(kpis["overdue_count"], 0)
        self.assertEqual(kpis["proformas_total"], 0)

    def test_money_kpis_omit_workshop_alarms(self):
        from datetime import date
        from app.routers.dashboard import _money_kpis

        kpis = _money_kpis([], [], date(2026, 9, 29))
        self.assertNotIn("overdue_count", kpis)
        self.assertEqual(kpis["income_today"], 0)
        self.assertEqual(kpis["to_collect"], 0)


if __name__ == "__main__":
    main()
