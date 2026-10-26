"""Simulation engine: produces fake samples that look like ICMP + SNMP results.

A sample has the same shape a real collector will produce in Phase 3, so the
rest of the pipeline (ingest -> status -> rules -> alerts) does not care where
data came from. Every row it produces is tagged source="simulation".
"""

import math
import random
from datetime import datetime

SCENARIOS = {
    "normal": "ปกติ",
    "high_latency": "Latency สูง",
    "packet_loss": "Packet Loss",
    "high_cpu": "CPU สูง",
    "offline": "Offline (ไม่ตอบ Ping)",
    "stale": "ไม่มีข้อมูล (Unknown)",
}

METRIC_UNITS = {
    "latency_ms": "ms",
    "packet_loss_pct": "%",
    "cpu_pct": "%",
    "memory_pct": "%",
    "traffic_in_mbps": "Mbps",
    "traffic_out_mbps": "Mbps",
}

# Typical healthy values per device type: (latency ms, cpu %, memory %, traffic Mbps)
_BASELINES = {
    "router": (3.0, 25, 45, 300),
    "switch": (1.5, 15, 35, 450),
    "firewall": (4.0, 35, 55, 250),
    "server": (1.0, 30, 60, 120),
}


def _daily_wave(now: datetime, device_id: int) -> float:
    """0..1 load factor that rises during factory working hours (Thai time)."""
    hour = (now.hour + 7) % 24 + now.minute / 60
    phase = device_id * 0.37
    return 0.5 + 0.4 * math.sin((hour - 8) / 24 * 2 * math.pi + phase)


def generate_sample(
    device_id: int, device_type: str, scenario: str, now: datetime, rng: random.Random
) -> dict | None:
    """Return one sample, or None when the collector "gets no data" (stale)."""
    if scenario == "stale":
        return None

    latency, cpu, mem, traffic = _BASELINES.get(device_type, _BASELINES["switch"])
    load = _daily_wave(now, device_id)

    if scenario == "offline":
        return {"reachable": False, "metrics": {"packet_loss_pct": 100.0}}

    metrics = {
        "latency_ms": max(0.2, rng.gauss(latency * (0.8 + load * 0.4), latency * 0.15)),
        "packet_loss_pct": 0.0 if rng.random() > 0.05 else rng.choice([1.0, 2.0]),
        "cpu_pct": min(100, max(1, rng.gauss(cpu * (0.7 + load * 0.6), 3))),
        "memory_pct": min(100, max(1, rng.gauss(mem, 1.5))),
        "traffic_in_mbps": max(0, rng.gauss(traffic * load, traffic * 0.05)),
        "traffic_out_mbps": max(0, rng.gauss(traffic * load * 0.6, traffic * 0.04)),
    }

    if scenario == "high_latency":
        metrics["latency_ms"] = rng.uniform(150, 320)
    elif scenario == "packet_loss":
        metrics["packet_loss_pct"] = rng.uniform(25, 45)
        metrics["latency_ms"] = rng.uniform(40, 90)
    elif scenario == "high_cpu":
        metrics["cpu_pct"] = rng.uniform(93, 99.5)

    return {"reachable": True, "metrics": {k: round(v, 2) for k, v in metrics.items()}}
