"""Measurement reads.

Bounded time windows only. Gaps are returned as gaps: the API never
interpolates or fabricates samples to fill a chart.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.core.authz import require_patient_access
from app.core.deps import AuthDep, DbDep, parse_uuid
from app.core.enums import MetricType, QualityStatus, SourceType
from app.core.errors import validation_error

router = APIRouter(tags=["measurements"])

DEFAULT_WINDOW = timedelta(hours=24)
MAX_WINDOW = timedelta(days=30)


class MeasurementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    metric_type: MetricType
    value: float
    unit: str
    observed_at: datetime
    window_start: datetime | None
    window_end: datetime | None
    quality_status: QualityStatus
    source_type: SourceType
    algorithm_version: str | None


@router.get("/patients/{patient_id}/measurements", response_model=list[MeasurementResponse])
def list_measurements(
    patient_id: str,
    ctx: AuthDep,
    db: DbDep,
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    metrics: Annotated[list[MetricType] | None, Query()] = None,
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[MeasurementResponse]:
    from sqlalchemy import select

    from app.models.clinical import MeasurementSummary

    patient = require_patient_access(db, ctx, parse_uuid(patient_id))

    now = datetime.now(UTC)
    end = to_ts or now
    start = from_ts or (end - DEFAULT_WINDOW)

    if start >= end:
        raise validation_error("'from' must be earlier than 'to'")
    if (end - start) > MAX_WINDOW:
        raise validation_error("Requested window exceeds the 30 day maximum")

    stmt = select(MeasurementSummary).where(
        MeasurementSummary.patient_id == patient.id,
        MeasurementSummary.observed_at >= start,
        MeasurementSummary.observed_at <= end,
    )
    if metrics:
        stmt = stmt.where(MeasurementSummary.metric_type.in_([m.value for m in metrics]))

    rows = db.scalars(
        stmt.order_by(MeasurementSummary.observed_at.desc()).limit(limit)
    ).all()
    return [MeasurementResponse.model_validate(r) for r in rows]
