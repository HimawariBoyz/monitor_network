"""Background worker: runs the simulation engine and the rule engine.

Run with `python -m app.worker`. In Phase 3 a real ICMP/SNMPv3 collector will
feed the same ingest_sample() path alongside (never mixed with) simulated data.
"""

import logging
import random
import time
from datetime import timedelta

from sqlalchemy.orm import selectinload

from . import config
from . import db as dbmod
from .db import SessionLocal, init_db
from .engine.pipeline import RuleEngine, ingest_sample, mark_stale
from .engine.simulation import generate_sample
from .models import Device, DeviceMetric, Heartbeat, SimulationState, utcnow

log = logging.getLogger("worker")


def tick(db, rules: RuleEngine, rng: random.Random, now=None) -> None:
    now = now or utcnow()
    scenarios = {s.device_id: s.scenario for s in db.query(SimulationState).all()}
    devices = (
        db.query(Device)
        .options(selectinload(Device.status))
        .filter_by(monitoring_enabled=True, source="simulation")
        .all()
    )
    for device in devices:
        sample = generate_sample(
            device.id, device.device_type, scenarios.get(device.id, "normal"), now, rng
        )
        if sample is not None:
            ingest_sample(db, device, sample, now)
    mark_stale(db, now)
    opened = rules.evaluate(db, now)
    db.merge(Heartbeat(name="simulation", last_beat=now))
    db.commit()
    for alert in opened:
        log.info("ALERT %s: %s", alert.severity, alert.message)


def prune_metrics(db, now=None) -> int:
    """Delete metrics past retention. TimescaleDB does this itself with a policy."""
    cutoff = (now or utcnow()) - timedelta(days=config.METRICS_RETENTION_DAYS)
    deleted = db.query(DeviceMetric).filter(DeviceMetric.collected_at < cutoff).delete(
        synchronize_session=False
    )
    db.commit()
    return deleted


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    init_db()
    rules = RuleEngine()
    rng = random.Random()
    log.info("simulation engine started, interval=%ss", config.SIM_INTERVAL_SECONDS)
    next_prune = 0.0
    while True:
        started = time.monotonic()
        with SessionLocal() as db:
            try:
                tick(db, rules, rng)
                if not dbmod.HAS_TIMESCALE and started >= next_prune:
                    log.info("pruned %s old metric rows", prune_metrics(db))
                    next_prune = started + 3600
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("tick failed")
        time.sleep(max(0.0, config.SIM_INTERVAL_SECONDS - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
