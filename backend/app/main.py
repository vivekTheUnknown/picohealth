"""FastAPI application factory."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import APIError, api_error_handler, request_validation_handler
from app.core.middleware import CSRFMiddleware, RequestContextMiddleware
from app.modules.assignments.router import router as assignments_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.devices.router import router as devices_router
from app.modules.events.router import router as events_router
from app.modules.measurements.router import router as measurements_router
from app.modules.notes.router import router as notes_router
from app.modules.patient_records.router import router as patient_records_router
from app.modules.patients.router import admin_router as admin_patients_router
from app.modules.patients.router import doctor_router as patients_router
from app.modules.system_health.router import router as health_router
from app.modules.users.router import router as users_router

logger = logging.getLogger("app")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    # Request id / headers outermost, then CSRF.
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(RequestContextMiddleware)

    # Only relevant if the portal is served cross-origin. The preferred
    # deployment proxies /api/* through Next.js, making CORS unnecessary.
    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.add_exception_handler(APIError, api_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_handler)

    app.include_router(health_router)

    prefix = settings.api_prefix
    app.include_router(auth_router, prefix=prefix)
    app.include_router(patients_router, prefix=prefix)
    app.include_router(patient_records_router, prefix=prefix)
    app.include_router(admin_patients_router, prefix=prefix)
    app.include_router(events_router, prefix=prefix)
    app.include_router(measurements_router, prefix=prefix)
    app.include_router(notes_router, prefix=prefix)
    app.include_router(assignments_router, prefix=prefix)
    app.include_router(devices_router, prefix=prefix)
    app.include_router(users_router, prefix=prefix)
    app.include_router(audit_router, prefix=prefix)
    app.include_router(dashboard_router, prefix=prefix)

    _assert_production_safety()
    return app


def _assert_production_safety() -> None:
    """Fail fast rather than ship insecure defaults."""
    if settings.is_production:
        problems = []
        if not settings.secure_cookies:
            problems.append("secure_cookies must be true in production")
        if settings.database_url.startswith("sqlite"):
            problems.append("production must not use SQLite")
        if problems:
            raise RuntimeError("Insecure production configuration: " + "; ".join(problems))


app = create_app()
