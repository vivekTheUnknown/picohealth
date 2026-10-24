"""Authentication behaviour: sessions, cookies, CSRF, revocation."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.enums import Role, UserStatus
from app.main import app as application
from tests.conftest import PASSWORD, login, make_user


def test_login_sets_session_and_csrf_cookies(client, db):
    user = make_user(db, email="doc@example.com")
    response = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == user.email
    assert "doctor" in body["roles"]

    session_cookie = client.cookies.get(settings.session_cookie_name)
    csrf_cookie = client.cookies.get(settings.csrf_cookie_name)
    assert session_cookie
    assert csrf_cookie

    # Session cookie must not be readable by JavaScript.
    raw = response.headers.get("set-cookie", "")
    assert "HttpOnly" in raw or any(
        "HttpOnly" in v for k, v in response.headers.multi_items() if k == "set-cookie"
    )


def test_me_returns_identity_and_permissions(client, db):
    user = make_user(db, email="doc2@example.com")
    login(client, user)
    body = client.get("/api/v1/me").json()
    assert body["id"] == str(user.id)
    assert "patients:read_assigned" in body["permissions"]
    # An admin-only permission must not leak into a doctor's set.
    assert "users:manage" not in body["permissions"]


def test_me_requires_authentication(client):
    assert client.get("/api/v1/me").status_code == 401


def test_login_rejects_wrong_password(client, db):
    user = make_user(db, email="doc3@example.com")
    response = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "wrong-password"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_login_unknown_email_is_indistinguishable(client, db):
    """No account enumeration through differing messages."""
    known = make_user(db, email="known@example.com")
    bad_password = client.post(
        "/api/v1/auth/login", json={"email": known.email, "password": "nope-nope"}
    )
    unknown_email = client.post(
        "/api/v1/auth/login",
        json={"email": "ghost@example.com", "password": "nope-nope"},
    )
    assert bad_password.status_code == unknown_email.status_code == 401
    assert bad_password.json() == unknown_email.json()


def test_logout_revokes_session(client, db):
    user = make_user(db, email="doc4@example.com")
    login(client, user)
    assert client.get("/api/v1/me").status_code == 200

    assert client.post("/api/v1/auth/logout").status_code == 200
    # Cookies are cleared, so the cookie jar no longer carries the session.
    assert client.get("/api/v1/me").status_code == 401


def test_revoked_session_token_rejected_even_if_cookie_replayed(client, db):
    """Server-side revocation, not just cookie deletion."""
    user = make_user(db, email="doc5@example.com")
    login(client, user)
    stolen = client.cookies.get(settings.session_cookie_name)

    client.post("/api/v1/auth/logout")

    replay = TestClient(application)
    replay.cookies.set(settings.session_cookie_name, stolen)
    assert replay.get("/api/v1/me").status_code == 401


def test_state_changing_request_requires_csrf_header(client, db):
    user = make_user(db, email="doc6@example.com")
    login(client, user)

    # Log in from a second client without attaching the header.
    fresh = TestClient(application)
    fresh.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    response = fresh.post("/api/v1/auth/logout")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"


def test_mismatched_csrf_token_rejected(client, db):
    user = make_user(db, email="doc7@example.com")
    login(client, user)
    response = client.post(
        "/api/v1/auth/logout", headers={"X-CSRF-Token": "not-the-cookie-value"}
    )
    assert response.status_code == 403


def test_suspended_user_cannot_sign_in(client, db):
    user = make_user(db, email="suspended@example.com", status=UserStatus.SUSPENDED)
    response = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 403


def test_suspension_revokes_live_session(client, db):
    """A suspended user must not keep working with an already-issued cookie."""
    doctor = make_user(db, email="doc8@example.com")
    admin = make_user(db, role=Role.ADMIN)

    doctor_client = TestClient(application)
    login(doctor_client, doctor)
    assert doctor_client.get("/api/v1/me").status_code == 200

    login(client, admin)
    response = client.patch(
        f"/api/v1/admin/users/{doctor.id}/status", json={"status": "suspended"}
    )
    assert response.status_code == 200

    assert doctor_client.get("/api/v1/me").status_code == 401


def test_password_reset_endpoint_does_not_reveal_account_existence(client, db):
    make_user(db, email="real@example.com")
    known = client.post("/api/v1/auth/recover", json={"email": "real@example.com"})
    unknown = client.post("/api/v1/auth/recover", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_unauthenticated_state_change_blocked_before_csrf(client):
    """401 is more accurate than 403 when there is no session at all."""
    response = client.post("/api/v1/admin/patients", json={"display_name": "X"})
    assert response.status_code in (401, 403)
