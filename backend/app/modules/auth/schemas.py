"""Auth request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.config import settings
from app.core.enums import Permission, Role, UserStatus, VerificationStatus


class LoginRequest(BaseModel):
    """Sign-in accepts an email address or an exact display name.

    The mobile app signs in with the account name the user was given; the web
    portal keeps its email field. Exactly one identifier is required.
    """

    email: EmailStr | None = None
    identifier: str | None = Field(default=None, max_length=320)
    password: str = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def _require_identifier(self) -> "LoginRequest":
        if not self.email and not (self.identifier and self.identifier.strip()):
            raise ValueError("Provide an email address or account name")
        return self

    @property
    def login_identifier(self) -> str:
        if self.identifier and self.identifier.strip():
            return self.identifier.strip()
        return str(self.email)


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    status: UserStatus
    roles: list[Role]
    permissions: list[Permission]
    timezone: str
    doctor_verification_status: VerificationStatus | None = None
    patient_id: uuid.UUID | None = None
    last_login_at: datetime | None = None


class TokenResponse(BaseModel):
    """Bearer token issued to the mobile app.

    The token is the same server-side session value used by the browser, so
    expiry and revocation apply to it identically.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    me: MeResponse


class PermissionsResponse(BaseModel):
    roles: list[Role]
    permissions: list[Permission]


class RecoverRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    new_password: str = Field(min_length=settings.password_min_length, max_length=256)


class AcceptInvitationRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=settings.password_min_length, max_length=256)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=settings.password_min_length, max_length=256)


class MessageResponse(BaseModel):
    message: str
