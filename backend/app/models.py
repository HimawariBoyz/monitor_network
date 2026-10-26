import json
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects import oracle
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Aware UTC datetimes on every database.

    PostgreSQL: TIMESTAMPTZ. Oracle: plain TIMESTAMP holding UTC, because the
    SQLAlchemy DateTime there is a DATE (no fractions) and python-oracledb drops
    the zone of TIMESTAMP WITH TIME ZONE values.
    """

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "oracle":
            return dialect.type_descriptor(oracle.TIMESTAMP())
        return dialect.type_descriptor(DateTime(timezone=True))

    def process_bind_param(self, value, dialect):
        if value is not None and dialect.name == "oracle" and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class PortableJSON(TypeDecorator):
    """JSON on PostgreSQL; JSON text in a VARCHAR2 on Oracle."""

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "oracle":
            return dialect.type_descriptor(String(4000))
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value, dialect):
        if dialect.name == "oracle" and value is not None:
            return json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if dialect.name == "oracle" and value is not None:
            return json.loads(value)
        return value


class OptString(TypeDecorator):
    """Optional text that reads back as "" instead of None.

    Oracle stores '' as NULL, so these columns are nullable and NULL means empty.
    """

    impl = String
    cache_ok = True

    def process_result_value(self, value, dialect):
        return "" if value is None else value


class OptText(OptString):
    impl = Text


TS = UTCDateTime()

# Device states. Offline = we checked and it did not answer.
# Unknown = we have no fresh data (collector problem / stale), so we can't tell.
ONLINE, OFFLINE, UNKNOWN = "online", "offline", "unknown"

ROLES = ("viewer", "engineer", "admin")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    full_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    hostname: Mapped[str] = mapped_column(String(128))
    ip_address: Mapped[str] = mapped_column(String(64))
    device_type: Mapped[str] = mapped_column(String(32))  # switch/router/firewall/server
    vendor: Mapped[str] = mapped_column(OptString(64), nullable=True)
    model: Mapped[str] = mapped_column(OptString(64), nullable=True)
    zone: Mapped[str] = mapped_column(String(64))
    group_name: Mapped[str] = mapped_column(OptString(64), nullable=True)
    description: Mapped[str] = mapped_column(OptText, default="", nullable=True)
    monitoring_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # "simulation" or "live". Phase 1 only has simulated devices.
    source: Mapped[str] = mapped_column(String(16), default="simulation")
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)

    status: Mapped["DeviceStatus"] = relationship(
        back_populates="device", uselist=False, cascade="all, delete-orphan"
    )


class DeviceStatus(Base):
    __tablename__ = "device_status"
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[str] = mapped_column(String(16), default=UNKNOWN)
    reason: Mapped[str] = mapped_column(String(255), default="ยังไม่มีข้อมูล")
    last_seen_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    state_changed_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    last_metrics: Mapped[dict] = mapped_column(PortableJSON, default=dict)
    source: Mapped[str] = mapped_column(String(16), default="simulation")

    device: Mapped[Device] = relationship(back_populates="status")


class DeviceMetric(Base):
    """Time series; turned into a TimescaleDB hypertable on collected_at."""

    __tablename__ = "device_metrics"
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    metric_key: Mapped[str] = mapped_column(String(32), primary_key=True)
    collected_at: Mapped[datetime] = mapped_column(TS, primary_key=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(OptString(16), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="simulation")


class SimulationState(Base):
    """What the Demo Control asked the simulator to do for a device.

    This is the only thing Demo Control writes: it never touches a real device.
    """

    __tablename__ = "simulation_state"
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    scenario: Mapped[str] = mapped_column(String(32), default="normal")
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    updated_by: Mapped[str] = mapped_column(String(64), default="system")


class AlertRule(Base):
    __tablename__ = "alert_rules"
    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    key: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    # metric_key from device_metrics, or "state" for device reachability
    metric: Mapped[str] = mapped_column(String(32))
    operator: Mapped[str] = mapped_column(String(4))  # > >= < <= ==
    threshold: Mapped[float] = mapped_column(Float, default=0)
    # used when metric == "state": the state that triggers the rule
    state_value: Mapped[str | None] = mapped_column(String(16), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    severity: Mapped[str] = mapped_column(String(16))  # critical/high/warning/info
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(OptText, default="", nullable=True)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id", ondelete="CASCADE"))
    severity: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(16), default="active")  # active/resolved
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    ack_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(16), default="simulation")

    device: Mapped[Device] = relationship()
    rule: Mapped[AlertRule] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    username: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(OptString(128), nullable=True)
    detail: Mapped[str] = mapped_column(OptText, default="", nullable=True)


class Heartbeat(Base):
    """Last time a background component reported in (e.g. the simulation engine)."""

    __tablename__ = "heartbeats"
    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_beat: Mapped[datetime] = mapped_column(TS, default=utcnow)
