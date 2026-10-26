from datetime import datetime

from .engine.pipeline import effective_state
from .models import Alert, AlertRule, Device, User


def user_out(user: User) -> dict:
    return {"id": user.id, "username": user.username, "full_name": user.full_name,
            "role": user.role}


def device_out(device: Device, now: datetime, active_alerts: int = 0) -> dict:
    state, reason = effective_state(device.status, now)
    status = device.status
    return {
        "id": device.id,
        "name": device.name,
        "hostname": device.hostname,
        "ip_address": device.ip_address,
        "device_type": device.device_type,
        "vendor": device.vendor,
        "model": device.model,
        "zone": device.zone,
        "group_name": device.group_name,
        "description": device.description,
        "monitoring_enabled": device.monitoring_enabled,
        "source": device.source,
        "state": state,
        "reason": reason,
        "last_seen_at": status.last_seen_at if status else None,
        "last_checked_at": status.last_checked_at if status else None,
        "state_changed_at": status.state_changed_at if status else None,
        "metrics": (status.last_metrics or {}) if status else {},
        "active_alerts": active_alerts,
    }


def alert_out(alert: Alert) -> dict:
    return {
        "id": alert.id,
        "device_id": alert.device_id,
        "device_name": alert.device.name,
        "zone": alert.device.zone,
        "rule_id": alert.rule_id,
        "rule_name": alert.rule.name,
        "severity": alert.severity,
        "message": alert.message,
        "state": alert.state,
        "value": alert.value,
        "detected_at": alert.detected_at,
        "resolved_at": alert.resolved_at,
        "acknowledged": alert.acknowledged_at is not None,
        "acknowledged_by": alert.acknowledged_by,
        "acknowledged_at": alert.acknowledged_at,
        "ack_note": alert.ack_note,
        "source": alert.source,
    }


def rule_out(rule: AlertRule) -> dict:
    return {
        "id": rule.id, "key": rule.key, "name": rule.name, "metric": rule.metric,
        "operator": rule.operator, "threshold": rule.threshold,
        "state_value": rule.state_value, "duration_seconds": rule.duration_seconds,
        "severity": rule.severity, "enabled": rule.enabled,
        "description": rule.description,
    }
