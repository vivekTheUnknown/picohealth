"""Uniform API error handling.

Responses carry a stable machine code and a human message; never a stack trace.
"""

from __future__ import annotations

import logging

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.validation")


class APIError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        *,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.retryable = retryable


def not_found(resource: str = "Resource") -> APIError:
    return APIError("not_found", f"{resource} not found", status.HTTP_404_NOT_FOUND)


def forbidden(message: str = "You do not have permission to perform this action") -> APIError:
    return APIError("forbidden", message, status.HTTP_403_FORBIDDEN)


def unauthorized(message: str = "Authentication required") -> APIError:
    return APIError("unauthenticated", message, status.HTTP_401_UNAUTHORIZED)


def validation_error(message: str) -> APIError:
    return APIError("validation_error", message, 422)


async def api_error_handler(_request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "retryable": exc.retryable,
            }
        },
    )


async def request_validation_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Turn FastAPI's validation list into the portal's error envelope.

    The mobile app displays `error.message`, so a schema mismatch must name the
    offending field instead of leaving the user with a bare HTTP 422.
    """
    parts: list[str] = []
    for error in exc.errors()[:5]:
        location = ".".join(
            str(part) for part in error.get("loc", ()) if part not in ("body", "query")
        )
        message = str(error.get("msg", "invalid value"))
        parts.append(f"{location}: {message}" if location else message)
    detail = "; ".join(parts) or "The request did not match the API schema"
    logger.warning("request validation failed: %s", detail)
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": detail,
                "retryable": False,
            }
        },
    )
