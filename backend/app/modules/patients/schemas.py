"""Patient schemas.

Only approved demographic fields are exposed. Anything not listed here is not
part of the API contract.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EventStatus, PatientStatus, Severity


class PatientCreate(BaseModel):
    patient_code: str | None = Field(default=None, max_length=32)
    display_name: str = Field(min_length=1, max_length=200)
    date_of_birth: date | None = None
    sex_at_birth: str | None = Field(default=None, max_length=20)


class PatientUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    date_of_birth: date | None = None
    sex_at_birth: str | None = Field(default=None, max_length=20)
    status: PatientStatus | None = None


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_code: str
    display_name: str
    date_of_birth: date | None
    sex_at_birth: str | None
    status: PatientStatus
    created_at: datetime


class LatestEvent(BaseModel):
    """Compact event summary for a patient row.

    Deliberately minimal: a list row needs severity, state, type and time. Full
    evidence and transition history belong to the event detail endpoint.
    """

    id: uuid.UUID
    patient_id: uuid.UUID
    event_type: str
    severity: Severity
    status: EventStatus
    start_at: datetime


class PatientListItem(BaseModel):
    id: uuid.UUID
    patient_code: str
    display_name: str
    status: PatientStatus
    last_sync_at: datetime | None = None
    active_event_count: int = 0
    device_status: str | None = None
    # Without this a row can say "no recent event" while also showing an
    # active-event count, which is a contradiction on the primary screen.
    latest_event: LatestEvent | None = None


class PatientOverview(BaseModel):
    """Composition for the patient workspace header.

    Deliberately does not carry measurements or events; those have their own
    bounded, cached-friendly endpoints.
    """

    id: uuid.UUID
    patient_code: str
    display_name: str
    date_of_birth: date | None
    sex_at_birth: str | None
    status: PatientStatus
    assignment_type: str | None = None
    device_status: str | None = None
    device_last_seen_at: datetime | None = None
    active_event_count: int = 0
    data_freshness: str = "unknown"
