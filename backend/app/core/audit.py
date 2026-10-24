"""Audit trail.

Append-only from the application's perspective: rows are written, never
updated. Call sites pass minimal context only — no health values, no secrets.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.enums import AuditOutcome
from app.models.identity import AuditEvent


def record(
    db: Session,
    *,
    action: str,
    actor_user_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | uuid.UUID | None = None,
    outcome: AuditOutcome = AuditOutcome.SUCCESS,
    request_id: str | None = None,
    ip_address: str | None = None,
    context: dict[str, Any] | None = None,
    commit: bool = False,
) -> AuditEvent:
    event = AuditEvent(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        outcome=outcome.value,
        request_id=request_id,
        ip_address=ip_address,
        context=json.dumps(context) if context else None,
    )
    db.add(event)
    if commit:
        db.commit()
    return event
