# Factory NetMon: Network Monitoring (Phase 1 Demo)

เว็บไซต์ Network Monitoring สำหรับโรงงาน รุ่น **Phase 1: Demo / Simulation** ตาม Roadmap ของโครงการ
ใช้แนวคิดจาก Zabbix (Collector → Rules → Alerts → Acknowledge) แต่เขียนขึ้นใหม่ทั้งหมด

> ⚠️ ทุกอุปกรณ์และข้อมูลในรุ่นนี้เป็น **ข้อมูลจำลอง** (`source=simulation`) ชื่ออุปกรณ์และโซนเป็นชื่อสมมติ
> ระบบยังไม่เชื่อมต่อและไม่สั่งงานอุปกรณ์จริงใด ๆ

## ความสามารถ

| หน้า | สิ่งที่ทำได้ |
|---|---|
| Login | เข้าสู่ระบบด้วย JWT แยกสิทธิ์ 3 ระดับ (Viewer / Engineer / Admin) |
| Dashboard | จำนวนอุปกรณ์ Online / Offline / Unknown, Active Alerts, สถานะตามโซน, กราฟ Latency รวม, เหตุการณ์ล่าสุด, สถานะ Simulation engine |
| Devices | ค้นหา/กรองตาม Zone, Group, ประเภท, สถานะ · Admin เพิ่ม/แก้ไข/ลบอุปกรณ์ได้ |
| Device Detail | ข้อมูลอุปกรณ์, สถานะพร้อมเหตุผล, ค่าล่าสุด, กราฟ Latency / Packet Loss / CPU / Memory / Traffic (15 นาที – 24 ชม.) พร้อมเส้น Threshold, ประวัติเหตุการณ์ |
| Alerts | แท็บ Active / ยังไม่รับทราบ / Acknowledged / Resolved / ทั้งหมด, กรองตาม Severity, รับทราบพร้อมบันทึก |
| Alert Rules | Engineer/Admin ปรับ Threshold, ระยะเวลา, Severity, เปิด/ปิด Rule |
| Demo Control | สาธิตวงจร **Normal → Problem → Alert → Acknowledge → Recovery** ทีละขั้น, จำลองทั้งโซน, ตั้ง scenario รายอุปกรณ์ (Engineer/Admin เท่านั้น) |
| Audit Log | บันทึกว่าใครทำอะไร เมื่อไร (Admin เท่านั้น) |

ข้อมูลอัปเดตเองทุก 5 วินาที (polling) เก็บเวลาเป็น UTC และแสดงเป็นเวลาไทย (UTC+7)

### Online / Offline / Unknown

| สถานะ | ความหมาย |
|---|---|
| **Online** | ตรวจแล้ว อุปกรณ์ตอบสนอง |
| **Offline** | ตรวจแล้ว อุปกรณ์**ไม่ตอบสนอง** (ICMP ไม่ตอบ, packet loss 100%) |
| **Unknown** | **ไม่มีข้อมูลใหม่** เกิน `STALE_AFTER_SECONDS` (ค่าเริ่มต้น 20 วินาที) เช่น Collector ล่มหรือเส้นทางข้อมูลขาด จึง**ยังสรุปไม่ได้**ว่าอุปกรณ์เสีย |

Unknown ใช้สีเทาและเกิด Alert ระดับ `info` ไม่ใช่ `critical` เพื่อไม่ให้สรุปผิดว่าอุปกรณ์เสีย
ถ้า worker หยุดทำงานทั้งตัว API ก็จะแสดงทุกอุปกรณ์เป็น Unknown เองเมื่อข้อมูลหมดอายุ

### Alert Rules เริ่มต้น

| Rule | เงื่อนไข | ต่อเนื่อง | Severity |
|---|---|---|---|
| อุปกรณ์ไม่ตอบสนอง (Offline) | state = offline | 10 วินาที | critical |
| ไม่มีข้อมูลล่าสุด (Unknown) | state = unknown | ทันที | info |
| Packet Loss สูง | packet_loss_pct > 10 | 15 วินาที | high |
| Latency สูง | latency_ms > 100 | 15 วินาที | warning |
| CPU สูง | cpu_pct > 90 | 15 วินาที | warning |

Alert เกิดเมื่อเงื่อนไขเป็นจริง**ต่อเนื่อง**ครบระยะเวลา (กันแจ้งเตือนกระพริบ) และ**ปิดเอง (Resolved)** เมื่อค่ากลับสู่ปกติ
การรับทราบ (Acknowledge) ไม่ได้ปิด Alert แต่บอกว่ามีคนรับเรื่องแล้ว
Rule ที่อิง Metric จะไม่ประเมินขณะอุปกรณ์ไม่ Online (ไม่มีข้อมูลที่เชื่อถือได้ จึงไม่เปิดและไม่ปิด Alert จากค่านั้น)

## สถาปัตยกรรม

```
┌──────────────┐   /api    ┌──────────────┐        ┌──────────────────────────┐
│ web (nginx + │ ────────▶ │ api (FastAPI)│ ─────▶ │ db: PostgreSQL 16 +      │
│ Angular)     │           └──────────────┘        │ TimescaleDB (hypertable  │
└──────────────┘                                   │ device_metrics)          │
                           ┌──────────────┐        │                          │
                           │ worker       │ ─────▶ │                          │
                           │ Simulation + │        └──────────────────────────┘
                           │ Rule engine  │
                           └──────────────┘
```

- **Frontend:** Angular 19 + Angular Material + ngx-echarts (`frontend/`)
- **Backend:** Python FastAPI + SQLAlchemy (`backend/app/`)
- **Worker:** `python -m app.worker` ทุก 5 วินาที: สร้างข้อมูลจำลอง → ingest → อัปเดตสถานะ → ประเมิน Rule → เปิด/ปิด Alert
  ข้อมูลจำลองมีรูปแบบเดียวกับผลจาก ICMP/SNMP จริง ทำให้ Phase 3 เพิ่ม Collector จริงเข้าทางเดียวกันได้ (`ingest_sample()`)
- **Database:** PostgreSQL + TimescaleDB (`device_metrics` เป็น hypertable มี retention policy 7 วัน) หรือ Oracle ที่ติดตั้งในเครื่อง (ดูหัวข้อด้านล่าง)
- **Demo Control** เขียนได้แค่ตาราง `simulation_state` ของอุปกรณ์ที่ `source=simulation` เท่านั้น (Safety Boundary ตาม Roadmap)

## วิธีรัน (Docker Compose)

ต้องมี Docker Desktop หรือ Docker Engine + Compose v2

```bash
git clone https://github.com/HimawariBoyz/monitor_network.git
cd monitor_network
cp .env.example .env          # ไม่บังคับ ถ้าไม่มีจะใช้ค่าเริ่มต้น
docker compose up -d --build
```

เปิด <http://localhost:8080> (เปลี่ยนพอร์ตได้ที่ `WEB_PORT` ใน `.env`)

ครั้งแรกระบบจะสร้างตาราง, ผู้ใช้ Demo, อุปกรณ์จำลอง 18 เครื่องใน 7 โซน และประวัติย้อนหลัง 60 นาทีให้กราฟมีข้อมูลทันที

| ผู้ใช้ | รหัสผ่าน | สิทธิ์ |
|---|---|---|
| `admin` | `admin123` | ทุกอย่าง + จัดการอุปกรณ์ + Audit Log |
| `engineer` | `engineer123` | รับทราบ Alert, ปรับ Threshold, Demo Control |
| `viewer` | `viewer123` | ดูอย่างเดียว |

> บัญชีและรหัสผ่านเหล่านี้มีไว้สำหรับ Demo เท่านั้น ก่อนใช้นอกเครื่องตัวเองให้เปลี่ยน `JWT_SECRET` และ `POSTGRES_PASSWORD` ใน `.env`

คำสั่งที่ใช้บ่อย

```bash
docker compose logs -f worker     # ดู Alert ที่เกิดขึ้นแบบ realtime
docker compose down               # หยุดระบบ (ข้อมูลยังอยู่)
docker compose down -v            # หยุดและลบข้อมูลทั้งหมด เริ่ม Demo ใหม่จากศูนย์
```

API docs (Swagger) อยู่ที่ <http://localhost:8080/api/docs> (กด Authorize แล้วใส่ token จาก `POST /api/auth/login`)

## ใช้ Oracle ที่ติดตั้งในเครื่องแทน PostgreSQL

ระบบรองรับ Oracle 12.2 ขึ้นไป (ทดสอบกับ Oracle XE 21c) ผ่าน `python-oracledb` แบบ thin mode จึงไม่ต้องลง Oracle Client
ใช้ไฟล์ `docker-compose.oracle.yml` ซึ่งไม่มี container ฐานข้อมูล แต่ให้ `api` และ `worker` ต่อไปที่ Oracle บนเครื่องผ่าน `host.docker.internal`

1. หา service name ของ PDB: เปิด Command Prompt แล้วพิมพ์ `lsnrctl status` ดูบรรทัด `Service "..."`
   ปกติคือ `XEPDB1` (XE 18c/21c), `FREEPDB1` (Oracle Database 23ai Free) หรือ `ORCLPDB` (ติดตั้งแบบ Enterprise)
2. สร้างผู้ใช้สำหรับระบบ (เปลี่ยนรหัสผ่านใน `oracle/create_user.sql` ได้)

   ```bat
   cd monitor_network
   sqlplus sys/<รหัส SYS ตอนติดตั้ง>@localhost:1521/XEPDB1 as sysdba @oracle\create_user.sql
   ```

3. คัดลอก `.env.example` เป็น `.env` แล้วแก้ `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_PORT`, `ORACLE_SERVICE` ให้ตรงกับเครื่อง
4. รัน

   ```bash
   docker compose -f docker-compose.oracle.yml up -d --build
   docker compose -f docker-compose.oracle.yml logs -f api worker
   ```

ครั้งแรกระบบจะสร้างตารางและข้อมูล Demo ใน schema ของผู้ใช้นั้นเอง ถ้าต่อไม่ได้ (`DPY-6005`, `ORA-12514`)
ให้ตรวจ service name, พอร์ต และ Windows Firewall ว่าอนุญาตพอร์ต 1521
บน Oracle ไม่มี TimescaleDB จึงให้ worker ลบ Metrics ที่เก่ากว่า `METRICS_RETENTION_DAYS` ทุกชั่วโมงแทน

## สคริปต์ Demo แนะนำ (ประมาณ 5 นาที)

1. Login เป็น `engineer` → Dashboard ทุกอย่างเป็น Online
2. ไปหน้า **Demo Control** เลือกอุปกรณ์ (เช่น `LNA-SW-01` ใน Production Line A)
3. **Problem:** กด `Offline (ไม่ตอบ Ping)` → สถานะเปลี่ยนเป็น Offline ภายในรอบถัดไป (≤5 วินาที)
4. **Alert:** ประมาณ 10 วินาทีต่อมา Alert `Critical` เกิดขึ้น เห็นที่ Dashboard, Alerts และตัวเลขที่เมนู
5. **Acknowledge:** กด `รับทราบ` ใส่บันทึก → Alert ยัง Active แต่มีชื่อผู้รับทราบ
6. **Recovery:** กด `Recovery: กลับสู่ปกติ` → อุปกรณ์กลับเป็น Online และ Alert เปลี่ยนเป็น Resolved เอง
7. **Unknown ≠ Offline:** ตั้ง `WHS-SW-01` เป็น `ไม่มีข้อมูล (Unknown)` → หลัง 20 วินาทีเป็น Unknown (สีเทา, Alert info)
   เทียบกับอุปกรณ์ที่ Offline (สีแดง, Alert critical)
8. ลอง `Latency สูง` / `Packet Loss` แล้วดูกราฟในหน้า Device Detail พร้อมเส้น Threshold
9. ลอง **จำลองทั้งโซน** เช่น Production Line B → Offline
10. Login เป็น `admin` ดู **Audit Log** ว่าใครทำอะไรไปบ้าง แล้วกด `คืนค่าปกติทั้งหมด`

## พัฒนาแบบไม่ใช้ Docker

Backend (Python 3.12+; ต้องมี PostgreSQL หรือ TimescaleDB ที่พอร์ต 5432)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://monitor:monitor@localhost:5432/monitor
uvicorn app.main:app --reload          # API ที่ :8000
python -m app.worker                   # อีก terminal: simulation + rule engine
```

ถ้าไม่มี TimescaleDB ระบบจะใช้ PostgreSQL ธรรมดาได้ หรือใช้ Oracle โดยตั้ง
`DATABASE_URL=oracle+oracledb://monitor:monitor@localhost:1521/?service_name=XEPDB1`

Frontend (Node 20+)

```bash
cd frontend
npm install
npx ng serve --proxy-config proxy.conf.json   # http://localhost:4200, ส่ง /api ไปที่ :8000
```

### Tests

```bash
docker run -d --name tsdb-test -p 5433:5432 -e POSTGRES_USER=monitor \
  -e POSTGRES_PASSWORD=monitor -e POSTGRES_DB=monitor timescale/timescaledb:2.17.2-pg16
cd backend && pytest -q
```

ทดสอบกับ Oracle: ตั้ง `TEST_ORACLE_DATABASE_URL` เป็น schema ที่ลบข้อมูลได้ (เทสต์จะลบตารางก่อนเริ่ม)

```bash
TEST_ORACLE_DATABASE_URL='oracle+oracledb://monitor:monitor@localhost:1521/?service_name=XEPDB1' pytest -q
```

ทดสอบ: Login/สิทธิ์ตาม Role, วงจร Normal → Offline → Alert → Ack → Recovery, Alert จาก Metric (Latency),
Unknown แยกจาก Offline และกราฟย้อนหลัง

## โครงสร้างโปรเจกต์

```
backend/
  app/
    main.py              FastAPI app + routers
    worker.py            Simulation + rule engine loop
    engine/simulation.py สร้างข้อมูลจำลองตาม scenario
    engine/pipeline.py   ingest, สถานะ Online/Offline/Unknown, RuleEngine
    models.py            ตาราง devices, device_status, device_metrics, alert_rules, alerts, users, audit_logs, ...
    seed.py              ผู้ใช้ อุปกรณ์ และ Rule เริ่มต้น
    routers/             auth, dashboard, devices, alerts, demo, admin
  tests/
frontend/
  src/app/
    pages/               dashboard, devices, device-detail, alerts, rules, demo, audit, login
    core/                api/auth services, guards, models, polling
    shared/              chips, pipes, ack dialog, chart helpers
docker-compose.yml          PostgreSQL/TimescaleDB ใน container
docker-compose.oracle.yml   ใช้ Oracle ที่ติดตั้งในเครื่อง
oracle/create_user.sql      สร้างผู้ใช้ Oracle ให้ระบบ
```

## Environment variables

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `WEB_PORT` | 8080 | พอร์ตหน้าเว็บ |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | monitor | บัญชีฐานข้อมูล |
| `JWT_SECRET` | change-me-in-production | กุญแจเซ็น Token (ต้องเปลี่ยน) |
| `SIM_INTERVAL_SECONDS` | 5 | รอบการสร้างข้อมูลจำลอง |
| `STALE_AFTER_SECONDS` | 20 | ไม่มีข้อมูลนานเกินนี้ถือว่า Unknown |
| `METRICS_RETENTION_DAYS` | 7 | อายุการเก็บ Metrics (TimescaleDB retention หรือ worker ลบเองบน Oracle) |
| `ORACLE_USER` / `ORACLE_PASSWORD` | monitor | บัญชี Oracle (เฉพาะ `docker-compose.oracle.yml`) |
| `ORACLE_HOST` / `ORACLE_PORT` | host.docker.internal / 1521 | ที่อยู่ Oracle listener |
| `ORACLE_SERVICE` | XEPDB1 | service name ของ PDB |

## ขั้นต่อไป (ตาม Roadmap)

- **Phase 2:** หน้าจัดการผู้ใช้, Alembic migrations, Event History/Reports ตามช่วงเวลา, ทดสอบข้อมูลไม่หายหลัง restart, rate limit login
- **Phase 3:** Collector จริง (ICMP + SNMPv3 read-only) เป็น worker แยก ส่งข้อมูลเข้า `ingest_sample()` ด้วย `source=live`
  เฉพาะอุปกรณ์ที่บริษัทอนุมัติ, เก็บ Credential นอก source code
- **Phase 4:** Hardening, backup/restore, health checks, runbook, UAT
