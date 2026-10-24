"""Event and alert schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.core.enums import EventStatus, Severity


class EventResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    patient_display_name: str | None = None
    event_type: str
    severity: Severity
    start_at: datetime
    end_at: datetime | None
    status: EventStatus
    source: str
    rule_version: str | None
    evidence: dict[str, Any] | None = None
    created_at: datetime


class EventTransitionResponse(BaseModel):
    id: uuid.UUID
    prior_status: str | None
    new_status: str
    actor_user_id: uuid.UUID | None
    timestamp: datetime
    note: str | None


class EventDetail(EventResponse):
    transitions: list[EventTransitionResponse] = Field(default_factory=list)


class AlertActionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=2000)
