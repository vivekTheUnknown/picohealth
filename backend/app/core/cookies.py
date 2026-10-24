"""Cookie helpers.

Session cookie: HttpOnly, so JavaScript cannot read the session token.
CSRF cookie: deliberately readable by JS (double-submit pattern).
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import Response

from app.core.config import settings


def _base_kwargs(max_age: int) -> dict:
    return {
        "max_age": max_age,
        "secure": settings.secure_cookies,
        "samesite": "lax",
        "path": "/",
        **({"domain": settings.cookie_domain} if settings.cookie_domain else {}),
    }


def set_session_cookies(response: Response, *, session_token: str, csrf_token: str) -> None:
    max_age = settings.session_absolute_timeout_hours * 3600
    kwargs = _base_kwargs(max_age)
    response.set_cookie(
        settings.session_cookie_name, session_token, httponly=True, **kwargs
    )
    response.set_cookie(
        settings.csrf_cookie_name, csrf_token, httponly=False, **kwargs
    )


def clear_session_cookies(response: Response) -> None:
    kwargs = {
        "secure": settings.secure_cookies,
        "samesite": "lax",
        "path": "/",
        **({"domain": settings.cookie_domain} if settings.cookie_domain else {}),
    }
    response.delete_cookie(settings.session_cookie_name, httponly=True, **kwargs)
    response.delete_cookie(settings.csrf_cookie_name, **kwargs)


def session_max_age_seconds() -> int:
    return int(timedelta(hours=settings.session_absolute_timeout_hours).total_seconds())
