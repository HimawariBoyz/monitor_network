from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..models import Alert, AlertRule, User, utcnow
from ..security import audit, current_user, require_role
from ..serializers import alert_out, rule_out

router = APIRouter(tags=["alerts"])

SEVERITY_ORDER = {"critical": 0, "high": 1, "warning": 2, "info": 3}


@router.get("/alerts")
def list_alerts(
    state: str = Query("active", pattern="^(active|acknowledged|unacknowledged|resolved|all)$"),
    severity: str | None = None,
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    query = db.query(Alert).options(joinedload(Alert.device), joinedload(Alert.rule))
    if state == "active":
        query = query.filter(Alert.state == "active")
    elif state == "unacknowledged":
        query = query.filter(Alert.state == "active", Alert.acknowledged_at.is_(None))
    elif state == "acknowledged":
        query = query.filter(Alert.acknowledged_at.is_not(None))
    elif state == "resolved":
        query = query.filter(Alert.state == "resolved")
    if severity:
        query = query.filter(Alert.severity == severity)
    alerts = query.order_by(Alert.detected_at.desc()).limit(limit).all()
    if state in ("active", "unacknowledged"):
        alerts.sort(key=lambda a: (SEVERITY_ORDER.get(a.severity, 9), -a.detected_at.timestamp()))
    return [alert_out(a) for a in alerts]


class AckIn(BaseModel):
    note: str = Field("", max_length=255)


@router.post("/alerts/{alert_id}/ack")
def acknowledge(alert_id: int, body: AckIn, db: Session = Depends(get_db),
                user: User = Depends(require_role("engineer"))):
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "ไม่พบ Alert")
    if alert.acknowledged_at is not None:
        raise HTTPException(409, "Alert นี้ถูกรับทราบแล้ว")
    alert.acknowledged_at = utcnow()
    alert.acknowledged_by = user.username
    alert.ack_note = body.note or None
    audit(db, user, "alert.ack", f"alert:{alert.id}", f"{alert.message} | note: {body.note}")
    db.commit()
    return alert_out(alert)


@router.get("/alert-rules")
def list_rules(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [rule_out(r) for r in db.query(AlertRule).order_by(AlertRule.id)]


class RuleUpdate(BaseModel):
    threshold: float | None = None
    duration_seconds: int | None = Field(None, ge=0, le=86400)
    severity: str | None = Field(None, pattern="^(critical|high|warning|info)$")
    enabled: bool | None = None


@router.put("/alert-rules/{rule_id}")
def update_rule(rule_id: int, body: RuleUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_role("engineer"))):
    rule = db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(404, "ไม่พบ Rule")
    before = rule_out(rule)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(rule, key, value)
    changes = {k: f"{before[k]} → {v}" for k, v in body.model_dump(exclude_none=True).items()
               if before[k] != v}
    audit(db, user, "rule.update", f"rule:{rule.key}", str(changes))
    db.commit()
    return rule_out(rule)
