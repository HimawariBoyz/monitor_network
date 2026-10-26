from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import bindparam, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import db as dbmod
from ..db import get_db
from ..models import Alert, Device, DeviceStatus, SimulationState, User, UTCDateTime, utcnow
from ..security import audit, current_user, require_role
from ..serializers import alert_out, device_out

router = APIRouter(prefix="/devices", tags=["devices"])

DEVICE_TYPES = ("switch", "router", "firewall", "server")


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    hostname: str = Field(min_length=1, max_length=128)
    ip_address: str = Field(min_length=1, max_length=64)
    device_type: str
    vendor: str = ""
    model: str = ""
    zone: str = Field(min_length=1)
    group_name: str = ""
    description: str = ""
    monitoring_enabled: bool = True


def _active_alert_counts(db: Session) -> dict[int, int]:
    rows = (
        db.query(Alert.device_id, func.count())
        .filter(Alert.state == "active")
        .group_by(Alert.device_id)
        .all()
    )
    return dict(rows)


def _get_device(db: Session, device_id: int) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "ไม่พบอุปกรณ์")
    return device


@router.get("")
def list_devices(
    q: str | None = None,
    zone: str | None = None,
    device_type: str | None = None,
    group_name: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    query = db.query(Device).options(selectinload(Device.status)).order_by(Device.zone, Device.name)
    if q:
        like = f"%{q}%"
        query = query.filter(
            Device.name.ilike(like) | Device.ip_address.ilike(like)
            | Device.hostname.ilike(like) | Device.vendor.ilike(like)
            | Device.model.ilike(like)
        )
    if zone:
        query = query.filter(Device.zone == zone)
    if device_type:
        query = query.filter(Device.device_type == device_type)
    if group_name:
        query = query.filter(Device.group_name == group_name)
    now = utcnow()
    counts = _active_alert_counts(db)
    items = [device_out(d, now, counts.get(d.id, 0)) for d in query.all()]
    if state:
        items = [d for d in items if d["state"] == state]
    return items


@router.get("/filters")
def filters(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return {
        "zones": [z for (z,) in db.query(Device.zone).distinct().order_by(Device.zone)],
        "groups": [g for (g,) in db.query(Device.group_name).distinct().order_by(Device.group_name)],
        "types": list(DEVICE_TYPES),
    }


@router.get("/{device_id}")
def get_device(device_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    device = _get_device(db, device_id)
    return device_out(device, utcnow(), _active_alert_counts(db).get(device.id, 0))


@router.get("/{device_id}/metrics")
def device_metrics(
    device_id: int,
    minutes: int = Query(60, ge=5, le=60 * 24 * 7),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
):
    _get_device(db, device_id)
    bucket_seconds = max(10, minutes * 60 // 240)
    rows = db.execute(
        text(
            "SELECT ts, metric_key, avg(value) FROM ("
            f"SELECT {dbmod.bucket_epoch_sql()} AS ts, metric_key, value FROM device_metrics "
            "WHERE device_id = :device_id AND collected_at >= :since"
            ") m GROUP BY ts, metric_key ORDER BY ts"
        ).bindparams(bindparam("since", type_=UTCDateTime())),
        {"bucket": bucket_seconds, "device_id": device_id,
         "since": utcnow() - timedelta(minutes=minutes)},
    ).all()
    series: dict[str, list] = defaultdict(list)
    for ts, key, value in rows:
        series[key].append([dbmod.epoch_to_dt(ts).isoformat(), round(float(value), 2)])
    return {"bucket_seconds": bucket_seconds, "series": series}


@router.get("/{device_id}/alerts")
def device_alerts(device_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    _get_device(db, device_id)
    alerts = (
        db.query(Alert).filter_by(device_id=device_id)
        .order_by(Alert.detected_at.desc()).limit(50).all()
    )
    return [alert_out(a) for a in alerts]


@router.post("", status_code=201)
def create_device(body: DeviceIn, db: Session = Depends(get_db),
                  user: User = Depends(require_role("admin"))):
    if body.device_type not in DEVICE_TYPES:
        raise HTTPException(422, "ประเภทอุปกรณ์ไม่ถูกต้อง")
    # Phase 1: every device is simulated; live devices come with the Phase 3 collector.
    device = Device(**body.model_dump(), source="simulation")
    db.add(device)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "ชื่ออุปกรณ์ซ้ำ")
    db.add(SimulationState(device_id=device.id, scenario="normal", updated_by=user.username))
    db.add(DeviceStatus(device_id=device.id, source=device.source))
    audit(db, user, "device.create", f"device:{device.name}", body.model_dump_json())
    db.commit()
    return device_out(device, utcnow())


@router.put("/{device_id}")
def update_device(device_id: int, body: DeviceIn, db: Session = Depends(get_db),
                  user: User = Depends(require_role("admin"))):
    if body.device_type not in DEVICE_TYPES:
        raise HTTPException(422, "ประเภทอุปกรณ์ไม่ถูกต้อง")
    device = _get_device(db, device_id)
    for key, value in body.model_dump().items():
        setattr(device, key, value)
    try:
        audit(db, user, "device.update", f"device:{device.name}", body.model_dump_json())
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "ชื่ออุปกรณ์ซ้ำ")
    return device_out(device, utcnow())


@router.delete("/{device_id}", status_code=204)
def delete_device(device_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_role("admin"))):
    device = _get_device(db, device_id)
    audit(db, user, "device.delete", f"device:{device.name}")
    db.delete(device)
    db.commit()
