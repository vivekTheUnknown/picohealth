"""Rate limiting and data-freshness labelling."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.config import settings
from app.core.rate_limit import limiter
from app.modules.patients.service import freshness_label
from tests.conftest import make_user


def test_login_is_rate_limited(client, db):
    """Without an identity provider, brute-force protection is entirely ours."""
    user = make_user(db, email="ratelimit@example.com")
    limiter.reset("login-ip", "testclient")

    original = settings.rate_limit_enabled
    settings.rate_limit_enabled = True
    try:
        statuses = []
        for _ in range(settings.login_max_attempts_per_window + 2):
            response = client.post(
                "/api/v1/auth/login",
                json={"email": user.email, "password": "definitely-wrong"},
            )
            statuses.append(response.status_code)

        assert 429 in statuses, statuses
        # The limit must not leak whether the account exists.
        assert statuses[0] == 401
    finally:
        settings.rate_limit_enabled = original
        limiter.reset("login-ip", "testclient")


def test_successful_login_resets_the_counter(client, db):
    user = make_user(db, email="reset@example.com")
    limiter.reset("login-ip", "testclient")

    original = settings.rate_limit_enabled
    settings.rate_limit_enabled = True
    try:
        for _ in range(3):
            client.post(
                "/api/v1/auth/login",
                json={"email": user.email, "password": "wrong-password"},
            )
        ok = client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": "test-password-123"},
        )
        assert ok.status_code == 200
        # Counter was cleared, so more attempts are allowed again.
        assert limiter.check("login-ip", "testclient", limit=3, window_seconds=300)
    finally:
        settings.rate_limit_enabled = original
        limiter.reset("login-ip", "testclient")


def test_freshness_label_never_implies_fresh_for_old_data():
    now = datetime.now(UTC)
    assert freshness_label(now) == "fresh"
    assert freshness_label(now - timedelta(hours=2)) == "stale"
    assert freshness_label(None) == "unknown"
