"""Add patient accounts and direct app measurement records.

Revision ID: 9b2f1c4d7a10
Revises: 8076c91941b3
Create Date: 2026-10-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "9b2f1c4d7a10"
down_revision = "8076c91941b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "patient_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("patient_id"),
    )

    op.create_table(
        "app_measurement_records",
        sa.Column("patient_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=True),
        sa.Column("client_record_id", sa.String(length=120), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("algorithm_version", sa.String(length=40), nullable=True),
        sa.Column("signal_quality", sa.String(length=40), nullable=True),
        sa.Column("heart_rate_bpm", sa.Float(), nullable=True),
        sa.Column("spo2_percent", sa.Float(), nullable=True),
        sa.Column("temperature_c", sa.Float(), nullable=True),
        sa.Column("perfusion_index_percent", sa.Float(), nullable=True),
        sa.Column("prv_rmssd_ms", sa.Float(), nullable=True),
        sa.Column("prv_beats", sa.Integer(), nullable=True),
        sa.Column("activity_level", sa.String(length=40), nullable=True),
        sa.Column("activity_rms_g", sa.Float(), nullable=True),
        sa.Column("orientation_class", sa.String(length=40), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_record_id", name="uq_app_record_client_id"),
    )
    op.create_index(
        "ix_app_records_patient_time",
        "app_measurement_records",
        ["patient_id", "measured_at"],
    )
    op.create_index(
        "ix_app_records_device_time",
        "app_measurement_records",
        ["device_id", "measured_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_app_records_device_time", table_name="app_measurement_records")
    op.drop_index("ix_app_records_patient_time", table_name="app_measurement_records")
    op.drop_table("app_measurement_records")
    op.drop_table("patient_profiles")
