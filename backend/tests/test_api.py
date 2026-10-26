import random
from datetime import timedelta

from app.db import SessionLocal
from app.engine.pipeline import RuleEngine
from app.models import DeviceStatus
from app.worker import tick

rules = RuleEngine()
rng = random.Random(1)


def run_tick():
    with SessionLocal() as db:
        tick(db, rules, rng)


def device_id(client, headers, name):
    devices = client.get("/api/devices", params={"q": name}, headers=headers).json()
    return next(d["id"] for d in devices if d["name"] == name)


def test_requires_login(client):
    assert client.get("/api/devices").status_code == 401
    bad = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert bad.status_code == 401


def test_seed_and_roles(client, viewer, engineer, admin):
    devices = client.get("/api/devices", headers=viewer).json()
    assert len(devices) == 18
    assert all(d["source"] == "simulation" for d in devices)
    did = devices[0]["id"]
    # viewer is read-only
    assert client.post(f"/api/demo/devices/{did}/scenario", json={"scenario": "offline"},
                       headers=viewer).status_code == 403
    assert client.get("/api/audit-logs", headers=engineer).status_code == 403
    assert client.get("/api/audit-logs", headers=admin).status_code == 200
    body = {"name": "TEST-SW-99", "hostname": "t", "ip_address": "10.99.0.1",
            "device_type": "switch", "zone": "Lab"}
    assert client.post("/api/devices", json=body, headers=engineer).status_code == 403
    created = client.post("/api/devices", json=body, headers=admin)
    assert created.status_code == 201
    assert client.delete(f"/api/devices/{created.json()['id']}", headers=admin).status_code == 204


def test_alert_cycle(client, engineer):
    # Make rules fire immediately so the test doesn't wait for durations.
    for rule in client.get("/api/alert-rules", headers=engineer).json():
        r = client.put(f"/api/alert-rules/{rule['id']}", json={"duration_seconds": 0},
                       headers=engineer)
        assert r.status_code == 200

    run_tick()
    dev = device_id(client, engineer, "LNA-SW-01")
    assert client.get(f"/api/devices/{dev}", headers=engineer).json()["state"] == "online"

    # Normal -> Problem
    client.post(f"/api/demo/devices/{dev}/scenario", json={"scenario": "offline"}, headers=engineer)
    run_tick()
    d = client.get(f"/api/devices/{dev}", headers=engineer).json()
    assert d["state"] == "offline"

    # -> Alert
    alerts = client.get(f"/api/devices/{dev}/alerts", headers=engineer).json()
    active = [a for a in alerts if a["state"] == "active"]
    assert [a["rule_name"] for a in active] == ["อุปกรณ์ไม่ตอบสนอง (Offline)"]
    assert active[0]["severity"] == "critical"

    # -> Acknowledge
    ack = client.post(f"/api/alerts/{active[0]['id']}/ack", json={"note": "กำลังตรวจสอบ"},
                      headers=engineer)
    assert ack.status_code == 200 and ack.json()["acknowledged_by"] == "engineer"
    acked = client.get("/api/alerts", params={"state": "acknowledged"}, headers=engineer).json()
    assert any(a["id"] == active[0]["id"] for a in acked)

    # -> Recovery
    client.post(f"/api/demo/devices/{dev}/scenario", json={"scenario": "normal"}, headers=engineer)
    run_tick()
    assert client.get(f"/api/devices/{dev}", headers=engineer).json()["state"] == "online"
    resolved = client.get("/api/alerts", params={"state": "resolved"}, headers=engineer).json()
    alert = next(a for a in resolved if a["id"] == active[0]["id"])
    assert alert["resolved_at"] is not None and alert["acknowledged"]


def test_metric_alert(client, engineer):
    dev = device_id(client, engineer, "CORE-RTR-01")
    client.post(f"/api/demo/devices/{dev}/scenario", json={"scenario": "high_latency"},
                headers=engineer)
    run_tick()
    active = client.get(f"/api/devices/{dev}/alerts", headers=engineer).json()
    assert any(a["rule_name"] == "Latency สูง" and a["state"] == "active" for a in active)
    client.post("/api/demo/reset", headers=engineer)
    run_tick()
    active = client.get("/api/alerts", params={"state": "active"}, headers=engineer).json()
    assert active == []


def test_unknown_is_not_offline(client, engineer):
    stale = device_id(client, engineer, "WHS-SW-01")
    down = device_id(client, engineer, "WHS-RTR-01")
    client.post(f"/api/demo/devices/{stale}/scenario", json={"scenario": "stale"}, headers=engineer)
    client.post(f"/api/demo/devices/{down}/scenario", json={"scenario": "offline"}, headers=engineer)
    run_tick()
    # pretend the last data for the stale device arrived a minute ago
    with SessionLocal() as db:
        status = db.get(DeviceStatus, stale)
        status.last_checked_at -= timedelta(seconds=60)
        db.commit()
    run_tick()

    s = client.get(f"/api/devices/{stale}", headers=engineer).json()
    o = client.get(f"/api/devices/{down}", headers=engineer).json()
    assert s["state"] == "unknown" and "หมดอายุ" in s["reason"]
    assert o["state"] == "offline"
    names = {a["rule_name"] for a in client.get(f"/api/devices/{stale}/alerts", headers=engineer).json()
             if a["state"] == "active"}
    assert names == {"ไม่มีข้อมูลล่าสุด (Unknown)"}

    summary = client.get("/api/dashboard/summary", headers=engineer).json()
    assert summary["states"]["unknown"] >= 1 and summary["states"]["offline"] >= 1
    client.post("/api/demo/reset", headers=engineer)


def test_metrics_history(client, viewer):
    dev = device_id(client, viewer, "SRV-SCADA-01")
    data = client.get(f"/api/devices/{dev}/metrics", params={"minutes": 60}, headers=viewer).json()
    assert len(data["series"]["latency_ms"]) > 5


def test_empty_text_fields_round_trip(client, admin):
    # Oracle stores '' as NULL; optional text must still read back as "".
    body = {"name": "SW-EMPTY-01", "hostname": "sw-empty-01", "ip_address": "10.9.9.9",
            "device_type": "switch", "zone": "Zone Z"}
    created = client.post("/api/devices", json=body, headers=admin)
    assert created.status_code == 201, created.text
    d = client.get(f"/api/devices/{created.json()['id']}", headers=admin).json()
    assert d["vendor"] == "" and d["description"] == "" and d["group_name"] == ""
    assert client.delete(f"/api/devices/{d['id']}", headers=admin).status_code == 204


def test_prune_metrics(client):
    from app.models import utcnow
    from app.worker import prune_metrics

    with SessionLocal() as db:
        assert prune_metrics(db, utcnow() + timedelta(days=365)) > 0
