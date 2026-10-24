"""Event and alert routes."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core import audit
from app.core.authz import require_patient_access
from app.core.deps import AuthDep, DbDep, MetaDep, parse_uuid, require_permissions
from app.core.enums import EventStatus, Permission
from app.core.errors import not_found
from app.core.pagination import Page, PageDep
from app.models.clinical import Event
from app.models.patients import Patient
from app.modules.events import service
from app.modules.events.schemas import (
    AlertActionRequest,
    EventDetail,
    EventResponse,
    EventTransitionResponse,
)
from app.modules.patients.service import assigned_patient_ids

router = APIRouter(tags=["events"])


def _to_response(event: Event, patient_name: str | None = None) -> EventResponse:
    return EventResponse(
        id=event.id,
        patient_id=event.patient_id,
        patient_display_name=patient_name,
        event_type=event.event_type,
        severity=event.severity,
        start_at=event.start_at,
        end_at=event.end_at,
        status=event.status,
        source=event.source,
        rule_version=event.rule_version,
        evidence=service.parse_evidence(event.evidence),
        created_at=event.created_at,
    )


@router.get("/alerts", response_model=Page[EventResponse])
def list_alerts(
    ctx: AuthDep,
    db: DbDep,
    page: PageDep,
    status_filter: EventStatus | None = Query(default=None, alias="status"),
) -> Page[EventResponse]:
    """All events across the caller's assigned patients."""
    ids = assigned_patient_ids(db, ctx.user.id)
    if not ids:
        return Page[EventResponse](items=[], total=0, limit=page.limit, offset=page.offset)

    from sqlalchemy import func, select

    stmt = select(Event).where(Event.patient_id.in_(ids))
    if status_filter:
        stmt = stmt.where(Event.status == status_filter)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(Event.start_at.desc()).limit(page.limit).offset(page.offset)
    ).all()

    names = {
        p.id: p.display_name
        for p in db.scalars(select(Patient).where(Patient.id.in_({e.patient_id for e in rows}))).all()
    }
    return Page[EventResponse](
        items=[_to_response(e, names.get(e.patient_id)) for e in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/patients/{patient_id}/events", response_model=Page[EventResponse])
def list_patient_events(
    patient_id: str,
    ctx: AuthDep,
    db: DbDep,
    page: PageDep,
    status_filter: EventStatus | None = Query(default=None, alias="status"),
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
) -> Page[EventResponse]:
    patient = require_patient_access(db, ctx, parse_uuid(patient_id))

    from sqlalchemy import func, select

    stmt = select(Event).where(Event.patient_id == patient.id)
    if status_filter:
        stmt = stmt.where(Event.status == status_filter)
    if from_ts:
        stmt = stmt.where(Event.start_at >= from_ts)
    if to_ts:
        stmt = stmt.where(Event.start_at <= to_ts)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(Event.start_at.desc()).limit(page.limit).offset(page.offset)
    ).all()
    return Page[EventResponse](
        items=[_to_response(e, patient.display_name) for e in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("/events/{event_id}", response_model=EventDetail)
def get_event(event_id: str, ctx: AuthDep, db: DbDep) -> EventDetail:
    event = db.get(Event, parse_uuid(event_id))
    if event is None:
        raise not_found("Event")

    # Access is decided by the event's patient, never by the event id alone.
    patient = require_patient_access(db, ctx, event.patient_id)

    base = _to_response(event, patient.display_name)
    transitions = service.transitions_for(db, event.id)
    return EventDetail(
        **base.model_dump(),
        transitions=[
            EventTransitionResponse(
                id=t.id,
                prior_status=t.prior_status,
                new_status=t.new_status,
                actor_user_id=t.actor_user_id,
                timestamp=t.timestamp,
                note=t.note,
            )
            for t in transitions
        ],
    )


def _apply_action(
    *,
    event_id: str,
    new_status: EventStatus,
    ctx: AuthDep,
    db: DbDep,
    meta: MetaDep,
    payload: AlertActionRequest,
) -> EventDetail:
    event = db.get(Event, parse_uuid(event_id))
    if event is None:
        raise not_found("Event")

    patient = require_patient_access(db, ctx, event.patient_id)
    service.transition(
        db, event=event, new_status=new_status, actor_user_id=ctx.user.id, note=payload.note
    )
    audit.record(
        db,
        action=f"alerts.{new_status.value}",
        actor_user_id=ctx.user.id,
        target_type="event",
        target_id=event.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    db.commit()

    base = _to_response(event, patient.display_name)
    transitions = service.transitions_for(db, event.id)
    return EventDetail(
        **base.model_dump(),
        transitions=[
            EventTransitionResponse(
                id=t.id,
                prior_status=t.prior_status,
                new_status=t.new_status,
                actor_user_id=t.actor_user_id,
                timestamp=t.timestamp,
                note=t.note,
            )
            for t in transitions
        ],
    )


@router.post(
    "/events/{event_id}/acknowledge",
    response_model=EventDetail,
    dependencies=[Depends(require_permissions(Permission.ALERTS_ACKNOWLEDGE))],
)
def acknowledge_event(
    event_id: str, payload: AlertActionRequest, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> EventDetail:
    return _apply_action(
        event_id=event_id,
        new_status=EventStatus.ACKNOWLEDGED,
        ctx=ctx,
        db=db,
        meta=meta,
        payload=payload,
    )


@router.post(
    "/events/{event_id}/resolve",
    response_model=EventDetail,
    dependencies=[Depends(require_permissions(Permission.ALERTS_RESOLVE))],
)
def resolve_event(
    event_id: str, payload: AlertActionRequest, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> EventDetail:
    return _apply_action(
        event_id=event_id,
        new_status=EventStatus.RESOLVED,
        ctx=ctx,
        db=db,
        meta=meta,
        payload=payload,
    )
