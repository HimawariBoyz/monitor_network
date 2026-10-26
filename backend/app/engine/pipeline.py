"""Ingestion, device status and alert rules.

The same path will serve live collector data later; only the `source` tag differs.
"""

import operator
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .. import config
from ..models import (
    OFFLINE,
    ONLINE,
    UNKNOWN,
    Alert,
    AlertRule,
    Device,
    DeviceMetric,
    DeviceStatus,
)
from .simulation import METRIC_UNITS

OPERATORS = {
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
    "==": operator.eq,
}

STALE_REASON = "ไม่มีข้อมูลใหม่เกิน {s} วินาที (ข้อมูลหมดอายุ / Collector ขาดการติดต่อ)"


def effective_state(status: DeviceStatus | None, now: datetime) -> tuple[str, str]:
    """State to show the user.

    Data older than STALE_AFTER_SECONDS is Unknown even if the last stored state
    said Online or Offline, so a dead collector never looks like a dead device.
    """
    if status is None or status.last_checked_at is None:
        return UNKNOWN, "ยังไม่มีข้อมูล"
    if now - status.last_checked_at > timedelta(seconds=config.STALE_AFTER_SECONDS):
        return UNKNOWN, STALE_REASON.format(s=config.STALE_AFTER_SECONDS)
    return status.state, status.reason


def _set_state(status: DeviceStatus, state: str, reason: str, now: datetime) -> None:
    if status.state != state:
        status.state_changed_at = now
    status.state = state
    status.reason = reason


def ingest_sample(db: Session, device: Device, sample: dict, now: datetime) -> None:
    status = device.status
    if status is None:
        status = DeviceStatus(device_id=device.id, source=device.source)
        db.add(status)
        device.status = status

    for key, value in sample["metrics"].items():
        db.add(
            DeviceMetric(
                device_id=device.id,
                metric_key=key,
                collected_at=now,
                value=value,
                unit=METRIC_UNITS[key],
                source=device.source,
            )
        )

    status.last_checked_at = now
    status.source = device.source
    if sample["reachable"]:
        status.last_seen_at = now
        status.last_metrics = sample["metrics"]
        _set_state(status, ONLINE, "ตอบสนองปกติ", now)
    else:
        status.last_metrics = {**(status.last_metrics or {}), **sample["metrics"]}
        _set_state(status, OFFLINE, "ไม่ตอบสนอง ICMP Ping (Packet loss 100%)", now)


def mark_stale(db: Session, now: datetime) -> None:
    for status in db.query(DeviceStatus).all():
        state, reason = effective_state(status, now)
        if state == UNKNOWN and status.state != UNKNOWN:
            _set_state(status, UNKNOWN, reason, now)


class RuleEngine:
    """Evaluates alert rules each tick.

    A rule fires only after its condition has held for `duration_seconds`
    (avoids alert flapping) and resolves as soon as the condition clears.
    Metric rules are skipped while a device is not Online: no valid data means
    we neither raise nor resolve on that metric.
    """

    def __init__(self) -> None:
        self.pending_since: dict[tuple[int, int], datetime] = {}

    def evaluate(self, db: Session, now: datetime) -> list[Alert]:
        rules = db.query(AlertRule).filter_by(enabled=True).all()
        devices = db.query(Device).filter_by(monitoring_enabled=True).all()
        active = {
            (a.device_id, a.rule_id): a
            for a in db.query(Alert).filter_by(state="active").all()
        }
        opened: list[Alert] = []

        for device in devices:
            state, _ = effective_state(device.status, now)
            metrics = (device.status.last_metrics or {}) if device.status else {}
            for rule in rules:
                key = (device.id, rule.id)
                if rule.metric == "state":
                    violated, value = state == rule.state_value, None
                else:
                    if state != ONLINE or rule.metric not in metrics:
                        self.pending_since.pop(key, None)
                        continue
                    value = metrics[rule.metric]
                    violated = OPERATORS[rule.operator](value, rule.threshold)

                alert = active.get(key)
                if violated:
                    since = self.pending_since.setdefault(key, now)
                    held = (now - since).total_seconds()
                    if alert is None and held >= rule.duration_seconds:
                        alert = Alert(
                            device_id=device.id,
                            rule_id=rule.id,
                            severity=rule.severity,
                            message=_message(rule, device, value),
                            value=value,
                            detected_at=now,
                            source=device.source,
                        )
                        db.add(alert)
                        active[key] = alert
                        opened.append(alert)
                else:
                    self.pending_since.pop(key, None)
                    if alert is not None:
                        alert.state = "resolved"
                        alert.resolved_at = now
                        del active[key]

        # Alerts whose rule was disabled or whose device stopped being monitored
        enabled_rules = {r.id for r in rules}
        monitored = {d.id for d in devices}
        for (device_id, rule_id), alert in active.items():
            if rule_id not in enabled_rules or device_id not in monitored:
                alert.state = "resolved"
                alert.resolved_at = now
        return opened


def _message(rule: AlertRule, device: Device, value: float | None) -> str:
    if value is None:
        return f"{rule.name} บน {device.name}"
    unit = METRIC_UNITS.get(rule.metric, "")
    return f"{rule.name} บน {device.name}: {value:.1f}{unit} ({rule.operator} {rule.threshold:g}{unit})"
