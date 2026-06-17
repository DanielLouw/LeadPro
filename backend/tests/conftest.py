"""
Shared pytest configuration.

Bypasses JWT authentication for all tests by overriding the _verify_token
dependency with a no-op. Tests that specifically test authentication behaviour
should remove this override locally.
"""

import pytest

from app.api.main import app, _verify_token


@pytest.fixture(autouse=True)
def bypass_auth():
    """Override the JWT guard so test clients don't need a Bearer token."""
    app.dependency_overrides[_verify_token] = lambda: None
    yield
    app.dependency_overrides.pop(_verify_token, None)
