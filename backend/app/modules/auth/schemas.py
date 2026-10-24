"""Auth request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.enums import Permission, Role, UserStatus, VerificationStatus


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    status: UserStatus
    roles: list[Role]
    permissions: list[Permission]
    timezone: str
    doctor_verification_status: VerificationStatus | None = None
    last_login_at: datetime | None = None


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
