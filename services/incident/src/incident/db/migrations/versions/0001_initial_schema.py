"""Initial schema — incidents, audit_log, cameras.

Revision ID: 0001
Revises:
Create Date: 2026-05-08

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── incidents ─────────────────────────────────────────────────────────
    op.create_table(
        "incidents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("camera_id", sa.String(), nullable=False),
        sa.Column("zone_id", sa.String(), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("low", "medium", "high", "critical", name="severity_enum"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "acknowledged",
                "resolved",
                "false_positive",
                name="status_enum",
            ),
            nullable=False,
            server_default="open",
        ),
        sa.Column("acknowledged_by", sa.String(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clip_url", sa.String(), nullable=True),
        sa.Column("detection_payload", sa.JSON(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_incidents_rule_id", "incidents", ["rule_id"])
    op.create_index("ix_incidents_camera_id", "incidents", ["camera_id"])
    op.create_index("ix_incidents_detected_at", "incidents", ["detected_at"])

    # ── audit_log ─────────────────────────────────────────────────────────
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "incident_id",
            sa.String(36),
            sa.ForeignKey("incidents.id"),
            nullable=False,
        ),
        sa.Column("actor", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("before_status", sa.String(), nullable=True),
        sa.Column("after_status", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_audit_log_incident_id", "audit_log", ["incident_id"])

    # ── cameras ───────────────────────────────────────────────────────────
    op.create_table(
        "cameras",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("rtsp_url", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("zones", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("cameras")
    op.drop_index("ix_audit_log_incident_id", "audit_log")
    op.drop_table("audit_log")
    op.drop_index("ix_incidents_detected_at", "incidents")
    op.drop_index("ix_incidents_camera_id", "incidents")
    op.drop_index("ix_incidents_rule_id", "incidents")
    op.drop_table("incidents")
    op.execute("DROP TYPE IF EXISTS severity_enum")
    op.execute("DROP TYPE IF EXISTS status_enum")
