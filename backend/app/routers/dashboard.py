from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import config
from .. import db as dbmod
from ..db import get_db
from ..engine.pipeline import effective_state
from ..models import Alert, AuditLog, Device, Heartbeat, User, utcnow
from ..security import current_user
from ..serializers import alert_out

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(db: Session = Depends(get_db), _: User = Depends(current_user)):
    now = utcnow()
    devices = db.query(Device).options(selectinload(Device.status)).all()
    states = Counter()
    zones: dict[str, Counter] = defaultdict(Counter)
    for d in devices:
        state, _ = effective_state(d.status, now)
        states[state] += 1
        zones[d.zone][state] += 1

    active = (
        db.query(Alert).options(joinedload(Alert.device), joinedload(Alert.rule))
        .filter(Alert.state == "active").order_by(Alert.detected_at.desc()).all()
    )
    recent = (
        db.query(Alert).options(joinedload(Alert.device), joinedload(Alert.rule))
        .order_by(Alert.detected_at.desc()).limit(10).all()
    )
    beat = db.get(Heartbeat, "simulation")
    beat_age = (now - beat.last_beat).total_seconds() if beat else None

    bucket = (
        "time_bucket(INTERVAL '1 minute', collected_at)" if dbmod.HAS_TIMESCALE
        else "date_bin(INTERVAL '1 minute', collected_at, TIMESTAMPTZ '2000-01-01')"
    )
    trend = db.execute(
        text(
            f"SELECT {bucket} AS ts, metric_key, avg(value) FROM device_metrics "
            "WHERE collected_at >= :since AND metric_key IN ('latency_ms', 'packet_loss_pct') "
            "GROUP BY ts, metric_key ORDER BY ts"
        ),
        {"since": now - timedelta(minutes=60)},
    ).all()
    trend_series: dict[str, list] = defaultdict(list)
    for ts, key, value in trend:
        trend_series[key].append([ts.isoformat(), round(value, 2)])

    return {
        "generated_at": now,
        "total_devices": len(devices),
        "states": {s: states.get(s, 0) for s in ("online", "offline", "unknown")},
        "zones": [{"zone": z, **{s: c.get(s, 0) for s in ("online", "offline", "unknown")}}
                  for z, c in sorted(zones.items())],
        "active_alerts": len(active),
        "unacknowledged_alerts": sum(1 for a in active if a.acknowledged_at is None),
        "alerts_by_severity": dict(Counter(a.severity for a in active)),
        "top_alerts": [alert_out(a) for a in active[:8]],
        "recent_events": [alert_out(a) for a in recent],
        "collector": {
            "name": "Simulation engine",
            "last_beat": beat.last_beat if beat else None,
            "age_seconds": beat_age,
            "healthy": beat_age is not None and beat_age <= config.STALE_AFTER_SECONDS,
        },
        "trend": trend_series,
        "recent_audit": [
            {"at": a.at, "username": a.username, "action": a.action, "target": a.target}
            for a in db.query(AuditLog).order_by(AuditLog.at.desc()).limit(5)
        ],
    }
