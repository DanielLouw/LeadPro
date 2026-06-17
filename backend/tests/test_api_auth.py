from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.api.main import app, _verify_token
from app.config import settings

client = TestClient(app)


@pytest.fixture(autouse=True)
def set_auth_env(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_PASSWORD", "test-password")
    monkeypatch.setattr(settings, "AUTH_SECRET", "test-secret")


@pytest.fixture()
def enforce_auth():
    """Remove the global bypass so the real _verify_token runs for this test."""
    app.dependency_overrides.pop(_verify_token, None)
    yield


class TestLogin:
    def test_correct_password_returns_access_token(self):
        resp = client.post("/api/auth/login", json={"password": "test-password"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_wrong_password_returns_401(self):
        resp = client.post("/api/auth/login", json={"password": "wrong"})
        assert resp.status_code == 401

    def test_token_contains_sub_and_exp(self):
        resp = client.post("/api/auth/login", json={"password": "test-password"})
        token = resp.json()["access_token"]
        payload = jwt.decode(token, "test-secret", algorithms=["HS256"])
        assert payload["sub"] == "user"
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        days_until_exp = (exp - datetime.now(tz=timezone.utc)).days
        assert 29 <= days_until_exp <= 30

    def test_expired_token_is_rejected_on_protected_route(self, enforce_auth):
        from datetime import timedelta
        expired_token = jwt.encode(
            {"sub": "user", "exp": datetime.now(tz=timezone.utc) - timedelta(seconds=1)},
            "test-secret",
            algorithm="HS256",
        )
        resp = client.get("/api/runs/", headers={"Authorization": f"Bearer {expired_token}"})
        assert resp.status_code == 401


class TestProtectedRoutes:
    def test_protected_route_without_token_returns_401(self, enforce_auth):
        resp = client.get("/api/runs/")
        assert resp.status_code == 401

    def test_health_endpoint_requires_no_token(self, enforce_auth):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_login_endpoint_requires_no_token(self, enforce_auth):
        resp = client.post("/api/auth/login", json={"password": "wrong"})
        assert resp.status_code == 401  # auth fails on bad password, not missing token
