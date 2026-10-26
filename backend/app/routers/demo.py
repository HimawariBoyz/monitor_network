"""Demo Control.

Safety boundary: these endpoints only change the `simulation_state` table, and
only for devices whose source is "simulation". Nothing here can reach or
command a real device.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..engine.simulation import SCENARIOS
from ..models import Device, SimulationState, User, utcnow
from ..security import audit, current_user, require_role
from ..serializers import device_out

router = APIRouter(prefix="/demo", tags=["demo"])


class ScenarioIn(BaseModel):
    scenario: str


def _check(scenario: str) -> None:
    if scenario not in SCENARIOS:
        raise HTTPException(422, f"scenario ต้องเป็นหนึ่งใน {list(SCENARIOS)}")


def _apply(db: Session, devices: list[Device], scenario: str, user: User) -> int:
    count = 0
    for device in devices:
        if device.source != "simulation":
            continue  # never touch live devices
        state = db.get(SimulationState, device.id) or SimulationState(device_id=device.id)
        state.scenario = scenario
        state.updated_at = utcnow()
        state.updated_by = user.username
        db.add(state)
        count += 1
    return count


@router.get("/scenarios")
def scenarios(_: User = Depends(current_user)):
    return [{"key": k, "label": v} for k, v in SCENARIOS.items()]


@router.get("/devices")
def demo_devices(db: Session = Depends(get_db), _: User = Depends(current_user)):
    now = utcnow()
    sim = {s.device_id: s for s in db.query(SimulationState).all()}
    devices = (
        db.query(Device).options(selectinload(Device.status))
        .filter_by(source="simulation").order_by(Device.zone, Device.name).all()
    )
    out = []
    for d in devices:
        item = device_out(d, now)
        s = sim.get(d.id)
        item["scenario"] = s.scenario if s else "normal"
        item["scenario_updated_by"] = s.updated_by if s else None
        item["scenario_updated_at"] = s.updated_at if s else None
        out.append(item)
    return out


@router.post("/devices/{device_id}/scenario")
def set_device_scenario(device_id: int, body: ScenarioIn, db: Session = Depends(get_db),
                        user: User = Depends(require_role("engineer"))):
    _check(body.scenario)
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(404, "ไม่พบอุปกรณ์")
    if device.source != "simulation":
        raise HTTPException(400, "Demo Control เปลี่ยนได้เฉพาะอุปกรณ์จำลองเท่านั้น")
    _apply(db, [device], body.scenario, user)
    audit(db, user, "demo.scenario", f"device:{device.name}", body.scenario)
    db.commit()
    return {"device_id": device.id, "scenario": body.scenario}


@router.post("/zones/{zone}/scenario")
def set_zone_scenario(zone: str, body: ScenarioIn, db: Session = Depends(get_db),
                      user: User = Depends(require_role("engineer"))):
    _check(body.scenario)
    devices = db.query(Device).filter_by(zone=zone, source="simulation").all()
    if not devices:
        raise HTTPException(404, "ไม่พบอุปกรณ์จำลองในโซนนี้")
    count = _apply(db, devices, body.scenario, user)
    audit(db, user, "demo.zone_scenario", f"zone:{zone}", f"{body.scenario} ({count} devices)")
    db.commit()
    return {"zone": zone, "scenario": body.scenario, "devices": count}


@router.post("/reset")
def reset(db: Session = Depends(get_db), user: User = Depends(require_role("engineer"))):
    devices = db.query(Device).filter_by(source="simulation").all()
    count = _apply(db, devices, "normal", user)
    audit(db, user, "demo.reset", "all simulated devices", f"{count} devices → normal")
    db.commit()
    return {"devices": count}
