import os
from unittest import TestCase, main

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from app import auth  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

PASSWORD = "taller-seguro-123"
PUBLIC_PREFIXES = ("/api/auth/", "/api/p/")


class AuthTestCase(TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self._password = settings.app_password
        settings.app_password = PASSWORD
        auth._failed.clear()

    def tearDown(self):
        settings.app_password = self._password
        auth._failed.clear()

    def login(self, password=PASSWORD):
        return self.client.post("/api/auth/login", json={"password": password})


class LoginTests(AuthTestCase):
    def test_status_says_login_is_required(self):
        self.assertEqual(self.client.get("/api/auth/status").json(), {"auth_required": True})

    def test_right_password_gives_a_token_that_works(self):
        res = self.login()
        self.assertEqual(res.status_code, 200)
        token = res.json()["token"]
        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me.status_code, 200)

    def test_wrong_password_is_rejected(self):
        self.assertEqual(self.login("otra").status_code, 401)

    def test_too_many_wrong_passwords_block_even_the_right_one(self):
        for _ in range(auth.MAX_FAILED):
            self.login("otra")
        self.assertEqual(self.login().status_code, 429)


class TokenTests(AuthTestCase):
    def test_no_token_is_rejected(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_tampered_token_is_rejected(self):
        token, expires_at = auth.create_token()
        forged = f"{expires_at + 999999}.{token.split('.')[1]}"
        res = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
        self.assertEqual(res.status_code, 401)

    def test_expired_token_is_rejected(self):
        long_ago = 1_000_000
        token, _ = auth.create_token(now=long_ago)
        self.assertFalse(auth.token_is_valid(token))

    def test_changing_the_password_closes_old_sessions(self):
        token, _ = auth.create_token()
        settings.app_password = "otra-clave"
        self.assertFalse(auth.token_is_valid(token))


class ProtectedRoutesTests(AuthTestCase):
    def test_business_endpoints_need_a_token(self):
        for path in ("/api/clients", "/api/work-orders/kanban", "/api/finances", "/api/dashboard/stats"):
            self.assertEqual(self.client.get(path).status_code, 401, path)

    def test_every_api_route_is_protected_unless_listed_as_public(self):
        unprotected = []
        for route in app.routes:
            path = getattr(route, "path", "")
            if not path.startswith("/api/") or path.startswith(PUBLIC_PREFIXES):
                continue
            calls = [dep.call for dep in route.dependant.dependencies]
            if auth.require_auth not in calls:
                unprotected.append(path)
        self.assertEqual(unprotected, [])

    def test_docs_stay_public(self):
        self.assertEqual(self.client.get("/openapi.json").status_code, 200)


class AuthDisabledTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        settings.app_password = ""

    def test_without_password_the_api_stays_open(self):
        self.assertEqual(self.client.get("/api/auth/status").json(), {"auth_required": False})
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def test_login_explains_there_is_no_password(self):
        self.assertEqual(self.login().status_code, 400)


if __name__ == "__main__":
    main()
