"""SQLAlchemy 2.0 ORM models for the Incident Service.

Column types are chosen to be portable across PostgreSQL and SQLite so
that in-memory SQLite can be used in tests without modification.
The Alembic migration promotes JSON → JSONB and adds the TimescaleDB
hypertable on detected_at for production.
"""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class IncidentModel(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(
        sa.String(36), primary_key=True, default=lambda: str(uuid4())
    )
    rule_id: Mapped[str] = mapped_column(sa.String, nullable=False, index=True)
    camera_id: Mapped[str] = mapped_column(sa.String, nullable=False, index=True)
    zone_id: Mapped[str] = mapped_column(sa.String, nullable=False)
    severity: Mapped[str] = mapped_column(
        sa.Enum("low", "medium", "high", "critical", name="severity_enum"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        sa.Enum(
            "open",
            "acknowledged",
            "resolved",
            "false_positive",
            name="status_enum",
        ),
        nullable=False,
        default="open",
    )
    acknowledged_by: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        sa.DateTime(timezone=True), nullable=True
    )
    clip_url: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    detection_payload: Mapped[dict] = mapped_column(sa.JSON, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        server_default=sa.func.now(),
        onupdate=sa.func.now(),
    )


class AuditLogModel(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(
        sa.String(36), sa.ForeignKey("incidents.id"), nullable=False, index=True
    )
    actor: Mapped[str] = mapped_column(sa.String, nullable=False)
    action: Mapped[str] = mapped_column(sa.String, nullable=False)
    note: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    before_status: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    after_status: Mapped[str | None] = mapped_column(sa.String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), server_default=sa.func.now()
    )
