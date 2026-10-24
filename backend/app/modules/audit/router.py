"""Audit log search.

Read-only. There is deliberately no write or delete route: audit rows are
produced only as a side effect of real operations.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from app.core.deps import DbDep, require_permissions
from app.core.enums import AuditOutcome, Permission
from app.core.pagination import Page, PageDep
from app.models.identity import AuditEvent

router = APIRouter(tags=["admin:audit"])


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: str | None
    outcome: AuditOutcome
    timestamp: datetime
    request_id: str | None
    ip_address: str | None
    context: str | None


@router.get(
    "/admin/audit-events",
    response_model=Page[AuditEventResponse],
    dependencies=[Depends(require_permissions(Permission.AUDIT_READ))],
)
def list_audit_events(
    db: DbDep,
    page: PageDep,
    actor_user_id: uuid.UUID | None = Query(default=None),
    action: str | None = Query(default=None, max_length=80),
    target_type: str | None = Query(default=None, max_length=40),
    target_id: str | None = Query(default=None, max_length=64),
    outcome: AuditOutcome | None = Query(default=None),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
) -> Page[AuditEventResponse]:
    from sqlalchemy import func, select

    stmt = select(AuditEvent)
    if actor_user_id:
        stmt = stmt.where(AuditEvent.actor_user_id == actor_user_id)
    if action:
        stmt = stmt.where(AuditEvent.action == action)
    if target_type:
        stmt = stmt.where(AuditEvent.target_type == target_type)
    if target_id:
        stmt = stmt.where(AuditEvent.target_id == target_id)
    if outcome:
        stmt = stmt.where(AuditEvent.outcome == outcome)
    if from_ts:
        stmt = stmt.where(AuditEvent.timestamp >= from_ts)
    if to_ts:
        stmt = stmt.where(AuditEvent.timestamp <= to_ts)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(AuditEvent.timestamp.desc()).limit(page.limit).offset(page.offset)
    ).all()
    return Page[AuditEventResponse](
        items=[AuditEventResponse.model_validate(r) for r in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )
