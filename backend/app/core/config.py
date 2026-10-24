"""Application configuration.

One settings object, loaded from the environment. No secrets in code.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- environment -----------------------------------------------------
    environment: str = "development"
    app_name: str = "Health Monitoring Portal API"
    api_prefix: str = "/api/v1"

    # --- database --------------------------------------------------------
    # Portable across Postgres and SQLite so tests need no external service.
    database_url: str = "sqlite:///./portal.db"

    # --- sessions --------------------------------------------------------
    session_cookie_name: str = "portal_session"
    csrf_cookie_name: str = "portal_csrf"
    session_idle_timeout_minutes: int = 60
    session_absolute_timeout_hours: int = 12
    secure_cookies: bool = False  # must be True outside local development
    cookie_domain: str | None = None

    # --- password reset / invitations -----------------------------------
    reset_token_ttl_minutes: int = 30
    invitation_token_ttl_hours: int = 72
    password_min_length: int = 12

    # --- rate limiting (in-process; prototype only) ----------------------
    rate_limit_enabled: bool = True
    login_max_attempts_per_window: int = 10
    login_window_seconds: int = 300

    # --- cors ------------------------------------------------------------
    # Only needed when the frontend is served from a different origin.
    # Preferred deployment proxies /api/* through Next.js (same origin).
    allowed_origins: list[str] = ["http://localhost:3000"]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_testing(self) -> bool:
        return self.environment.lower() == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
