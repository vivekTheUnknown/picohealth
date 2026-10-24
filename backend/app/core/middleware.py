"""Request middleware: correlation ids, security headers, CSRF enforcement."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.security import constant_time_equals

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Pre-authentication endpoints cannot carry a CSRF token because no session
# exists yet. SameSite cookies plus login-specific rate limiting cover these.
CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/recover",
    "/api/v1/auth/reset",
    "/api/v1/auth/accept-invitation",
}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Double-submit cookie check for state-changing requests.

    The CSRF cookie is readable by JavaScript (deliberately not HttpOnly) so
    the frontend can echo it in the X-CSRF-Token header. An attacker on another
    origin can cause the cookie to be sent but cannot read it, so it cannot
    produce a matching header.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
            if request.url.path not in CSRF_EXEMPT_PATHS:
                cookie_token = request.cookies.get(settings.csrf_cookie_name)
                header_token = request.headers.get("x-csrf-token")

                if not cookie_token or not header_token:
                    return self._reject("Missing CSRF token")
                if not constant_time_equals(cookie_token, header_token):
                    return self._reject("Invalid CSRF token")

        return await call_next(request)

    @staticmethod
    def _reject(message: str) -> JSONResponse:
        return JSONResponse(
            status_code=403,
            content={"error": {"code": "csrf_failed", "message": message, "retryable": False}},
        )
