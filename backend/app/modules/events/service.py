"""Alert lifecycle rules.

Acknowledging or resolving never deletes the original event or its history.
Every state change writes a transition row, and the route writes an audit row.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.enums import EventStatus
from app.core.errors import APIError
from app.models.clinical import AlertTransition, Event

# Terminal states cannot be reopened by an acknowledgement.
TERMINAL = {EventStatus.RESOLVED, EventStatus.FALSE_POSITIVE}


def _now() -> datetime:
    return datetime.now(UTC)


def parse_evidence(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except (ValueError, TypeError):
        return None


def transition(
    db: DbSession,
    *,
    event: Event,
    new_status: EventStatus,
    actor_user_id: uuid.UUID,
    note: str | None,
) -> AlertTransition:
    prior = event.status
    if prior == new_status:
        raise APIError("invalid_transition", f"Event is already {new_status.value}", 409)
    if prior in TERMINAL:
        raise APIError(
            "invalid_transition",
            f"Cannot change a {prior.value} event",
            409,
        )

    record = AlertTransition(
        event_id=event.id,
        prior_status=prior.value,
        new_status=new_status.value,
        actor_user_id=actor_user_id,
        timestamp=_now(),
        note=note,
    )
    event.status = new_status
    db.add(record)
    return record


def transitions_for(db: DbSession, event_id: uuid.UUID) -> list[AlertTransition]:
    return list(
        db.scalars(
            select(AlertTransition)
            .where(AlertTransition.event_id == event_id)
            .order_by(AlertTransition.timestamp)
        ).all()
    )
