"""Clinical notes.

Clinician-authored content only. Notes are never silently deleted: there is no
delete endpoint, by design.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.core import audit
from app.core.authz import require_patient_access
from app.core.deps import AuthDep, DbDep, MetaDep, parse_uuid, require_permissions
from app.core.enums import Permission
from app.core.pagination import Page, PageDep
from app.models.clinical import ClinicalNote

router = APIRouter(tags=["notes"])


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    related_event_id: uuid.UUID | None = None


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    author_user_id: uuid.UUID | None
    author_display_name: str | None = None
    related_event_id: uuid.UUID | None
    content: str
    created_at: datetime
    updated_at: datetime


@router.get("/patients/{patient_id}/notes", response_model=Page[NoteResponse])
def list_notes(patient_id: str, ctx: AuthDep, db: DbDep, page: PageDep) -> Page[NoteResponse]:
    from sqlalchemy import func, select

    from app.models.identity import User

    patient = require_patient_access(db, ctx, parse_uuid(patient_id))

    stmt = select(ClinicalNote).where(ClinicalNote.patient_id == patient.id)
    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(ClinicalNote.created_at.desc()).limit(page.limit).offset(page.offset)
    ).all()

    authors = {
        u.id: u.display_name
        for u in db.scalars(
            select(User).where(User.id.in_({n.author_user_id for n in rows if n.author_user_id}))
        ).all()
    }
    items = []
    for note in rows:
        item = NoteResponse.model_validate(note)
        item.author_display_name = authors.get(note.author_user_id)
        items.append(item)

    return Page[NoteResponse](items=items, total=total, limit=page.limit, offset=page.offset)


@router.post(
    "/patients/{patient_id}/notes",
    response_model=NoteResponse,
    status_code=201,
    dependencies=[Depends(require_permissions(Permission.CLINICAL_NOTES_WRITE))],
)
def create_note(
    patient_id: str, payload: NoteCreate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> NoteResponse:
    patient = require_patient_access(db, ctx, parse_uuid(patient_id))

    note = ClinicalNote(
        patient_id=patient.id,
        author_user_id=ctx.user.id,
        related_event_id=payload.related_event_id,
        content=payload.content.strip(),
    )
    db.add(note)
    audit.record(
        db,
        action="clinical_notes.created",
        actor_user_id=ctx.user.id,
        target_type="patient",
        target_id=patient.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    db.commit()

    response = NoteResponse.model_validate(note)
    response.author_display_name = ctx.user.display_name
    return response
