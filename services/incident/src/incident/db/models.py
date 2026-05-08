"""
SQLAlchemy ORM models (SQLAlchemy 2.0 mapped_column style).

TODO: Implement the following mapped classes:

    class Base(DeclarativeBase): pass

    class IncidentModel(Base):
        __tablename__ = "incidents"

        id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                        default=lambda: str(uuid4()))
        rule_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
        camera_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
        zone_id: Mapped[str] = mapped_column(String, nullable=False)
        severity: Mapped[str] = mapped_column(
            SAEnum("low", "medium", "high", "critical", name="severity_enum"),
            nullable=False,
        )
        status: Mapped[str] = mapped_column(
            SAEnum("open", "acknowledged", "resolved", "false_positive", name="status_enum"),
            nullable=False,
            default="open",
        )
        acknowledged_by: Mapped[str | None] = mapped_column(String, nullable=True)
        acknowledged_at: Mapped[datetime | None] = mapped_column(TIMESTAMPTZ, nullable=True)
        clip_url: Mapped[str | None] = mapped_column(String, nullable=True)
        detection_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
        detected_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, index=True)
        created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())
        updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now(),
                                                      onupdate=func.now())

TimescaleDB hypertable:
    The 'incidents' table must be converted to a TimescaleDB hypertable on detected_at.
    This is done in the Alembic migration (not here):
        op.execute("SELECT create_hypertable('incidents', 'detected_at')")
    Add this call AFTER the initial table creation migration.

Audit log table:
    class AuditLogModel(Base):
        __tablename__ = "audit_log"
        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        incident_id: Mapped[str] = mapped_column(String, ForeignKey("incidents.id"))
        actor: Mapped[str] = mapped_column(String, nullable=False)
        action: Mapped[str] = mapped_column(String, nullable=False)
        note: Mapped[str | None] = mapped_column(Text, nullable=True)
        before_status: Mapped[str | None] = mapped_column(String, nullable=True)
        after_status: Mapped[str | None] = mapped_column(String, nullable=True)
        created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, server_default=func.now())
"""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# TODO: class IncidentModel(Base): ...
# TODO: class AuditLogModel(Base): ...
