"""Demo seed data. All device and zone names are made up."""

import random
from datetime import timedelta

from sqlalchemy.orm import Session

from . import config
from .engine.simulation import METRIC_UNITS, generate_sample
from .models import (
    AlertRule,
    Device,
    DeviceMetric,
    DeviceStatus,
    SimulationState,
    User,
    utcnow,
)
from .security import hash_password

DEMO_USERS = [
    ("admin", "ผู้ดูแลระบบ (Demo)", "admin123", "admin"),
    ("engineer", "วิศวกรเครือข่าย (Demo)", "engineer123", "engineer"),
    ("viewer", "เจ้าหน้าที่เฝ้าระบบ (Demo)", "viewer123", "viewer"),
]

# name, type, vendor, model, zone, group, ip
DEMO_DEVICES = [
    ("CORE-RTR-01", "router", "Cisco", "ISR 4451", "Core Network", "Core", "10.10.0.1"),
    ("CORE-SW-01", "switch", "Cisco", "Catalyst 9500", "Core Network", "Core", "10.10.0.2"),
    ("FW-EDGE-01", "firewall", "Fortinet", "FortiGate 200F", "Core Network", "Security", "10.10.0.5"),
    ("FW-OT-01", "firewall", "Palo Alto", "PA-850", "Core Network", "Security", "10.10.0.6"),
    ("SRV-SCADA-01", "server", "Dell", "PowerEdge R750", "Server Room", "OT Servers", "10.20.0.11"),
    ("SRV-HIST-01", "server", "HPE", "ProLiant DL380", "Server Room", "OT Servers", "10.20.0.12"),
    ("SRV-MES-01", "server", "Dell", "PowerEdge R650", "Server Room", "IT Servers", "10.20.0.21"),
    ("SRV-AD-01", "server", "Lenovo", "ThinkSystem SR630", "Server Room", "IT Servers", "10.20.0.22"),
    ("OFC-SW-01", "switch", "Aruba", "2930F-48G", "Office Building", "Access", "10.30.1.2"),
    ("OFC-SW-02", "switch", "Aruba", "2930F-24G", "Office Building", "Access", "10.30.1.3"),
    ("LNA-SW-01", "switch", "Cisco", "IE-3400", "Production Line A", "Industrial", "10.40.1.2"),
    ("LNA-SW-02", "switch", "Cisco", "IE-3400", "Production Line A", "Industrial", "10.40.1.3"),
    ("LNB-SW-01", "switch", "Moxa", "EDS-G516E", "Production Line B", "Industrial", "10.40.2.2"),
    ("LNB-SW-02", "switch", "Moxa", "EDS-G516E", "Production Line B", "Industrial", "10.40.2.3"),
    ("WHS-RTR-01", "router", "MikroTik", "CCR2004", "Warehouse", "Branch", "10.50.0.1"),
    ("WHS-SW-01", "switch", "TP-Link", "TL-SG3428", "Warehouse", "Access", "10.50.0.2"),
    ("UTL-SW-01", "switch", "Hirschmann", "RSP35", "Utility & Boiler", "Industrial", "10.60.0.2"),
    ("UTL-FW-01", "firewall", "Fortinet", "FortiGate 60F", "Utility & Boiler", "Security", "10.60.0.1"),
]

DEMO_RULES = [
    # key, name, metric, op, threshold, state_value, duration, severity, description
    ("unreachable", "อุปกรณ์ไม่ตอบสนอง (Offline)", "state", "==", 0, "offline", 10, "critical",
     "ไม่ตอบ ICMP Ping ต่อเนื่องเกินระยะเวลาที่กำหนด"),
    ("no_data", "ไม่มีข้อมูลล่าสุด (Unknown)", "state", "==", 0, "unknown", 0, "info",
     "ข้อมูลหมดอายุ อาจเกิดจาก Collector หรือเส้นทางข้อมูล ไม่ได้แปลว่าอุปกรณ์เสีย"),
    ("packet_loss", "Packet Loss สูง", "packet_loss_pct", ">", 10, None, 15, "high",
     "Packet loss เกินเกณฑ์ต่อเนื่อง"),
    ("high_latency", "Latency สูง", "latency_ms", ">", 100, None, 15, "warning",
     "เวลาตอบสนองเกินเกณฑ์ต่อเนื่อง"),
    ("high_cpu", "CPU สูง", "cpu_pct", ">", 90, None, 15, "warning",
     "การใช้ CPU เกินเกณฑ์ต่อเนื่อง"),
]


def seed(db: Session) -> None:
    if db.query(User).count() == 0:
        for username, full_name, password, role in DEMO_USERS:
            db.add(User(username=username, full_name=full_name,
                        password_hash=hash_password(password), role=role))

    if db.query(AlertRule).count() == 0:
        for key, name, metric, op, threshold, state_value, duration, severity, desc in DEMO_RULES:
            db.add(AlertRule(key=key, name=name, metric=metric, operator=op,
                             threshold=threshold, state_value=state_value,
                             duration_seconds=duration, severity=severity, description=desc))

    if db.query(Device).count() == 0:
        devices = []
        for name, dtype, vendor, model, zone, group, ip in DEMO_DEVICES:
            device = Device(
                name=name, hostname=f"{name.lower()}.factory.local", ip_address=ip,
                device_type=dtype, vendor=vendor, model=model, zone=zone,
                group_name=group, description="อุปกรณ์จำลองสำหรับ Demo",
                source="simulation",
            )
            db.add(device)
            devices.append(device)
        db.flush()
        for device in devices:
            db.add(SimulationState(device_id=device.id, scenario="normal"))
            db.add(DeviceStatus(device_id=device.id, source="simulation"))
        _backfill_history(db, devices)


def _backfill_history(db: Session, devices: list[Device]) -> None:
    """Give the charts an hour of normal history so the demo doesn't start empty."""
    rng = random.Random(7)
    now = utcnow()
    step = timedelta(seconds=30)
    points = config.SEED_HISTORY_MINUTES * 2
    rows = []
    for device in devices:
        for i in range(points, 0, -1):
            at = now - step * i
            sample = generate_sample(device.id, device.device_type, "normal", at, rng)
            for key, value in sample["metrics"].items():
                rows.append(dict(device_id=device.id, metric_key=key, collected_at=at,
                                 value=value, unit=METRIC_UNITS[key], source="simulation"))
    db.bulk_insert_mappings(DeviceMetric, rows)
