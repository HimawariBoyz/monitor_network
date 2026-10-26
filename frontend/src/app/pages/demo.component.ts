import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Alert, Device } from '../core/models';
import { poll } from '../core/poll';
import { injectAcknowledge } from '../shared/ack';
import { SeverityChipComponent, StateChipComponent } from '../shared/chips';
import { AgoPipe } from '../shared/th-time.pipe';

type Step = 'normal' | 'problem' | 'alert' | 'ack' | 'recovery';

const SCENARIO_ICON: Record<string, string> = {
  normal: 'check_circle',
  high_latency: 'speed',
  packet_loss: 'signal_cellular_connected_no_internet_0_bar',
  high_cpu: 'memory',
  offline: 'power_off',
  stale: 'cloud_off',
};

@Component({
  selector: 'app-demo',
  imports: [FormsModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatSelectModule,
            MatFormFieldModule, StateChipComponent, SeverityChipComponent, AgoPipe],
  template: `
    <div class="page-head">
      <h1>Demo Control</h1>
      <span class="spacer"></span>
      <button mat-stroked-button (click)="reset()"><mat-icon>restart_alt</mat-icon>คืนค่าปกติทั้งหมด</button>
    </div>
    <div class="safety">
      <mat-icon>shield</mat-icon>
      <div><b>Safety Boundary:</b> หน้านี้เปลี่ยนเฉพาะ <b>ข้อมูลจำลอง</b> (source=simulation) ของ Simulation Engine
        ไม่มีการส่งคำสั่งใด ๆ ไปยังอุปกรณ์จริง ทุกการกระทำถูกบันทึกใน Audit Log</div>
    </div>

    <mat-card>
      <mat-card-header>
        <mat-card-title>สาธิตวงจรเหตุการณ์ทีละขั้น</mat-card-title>
        <mat-card-subtitle>Normal → Problem → Alert → Acknowledge → Recovery</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="walk-controls">
          <mat-form-field appearance="outline">
            <mat-label>อุปกรณ์</mat-label>
            <mat-select [ngModel]="selectedId()" (ngModelChange)="selectedId.set($event); refresh()">
              @for (d of devices(); track d.id) { <mat-option [value]="d.id">{{ d.name }} · {{ d.zone }}</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (selected(); as d) {
            <app-state-chip [state]="d.state" [reason]="d.reason" />
            <span class="muted">{{ d.reason }}</span>
          }
        </div>

        <ol class="stepper">
          @for (s of steps; track s.key; let i = $index) {
            <li [class.done]="stepIndex() > i" [class.current]="stepIndex() === i">
              <span class="dot">{{ i + 1 }}</span>
              <div><b>{{ s.title }}</b><div class="muted small">{{ s.hint }}</div></div>
            </li>
          }
        </ol>

        @if (selected(); as d) {
          <div class="walk-actions">
            <div>
              <div class="muted small">2. สร้างปัญหา (เลือกแบบ)</div>
              <div class="btn-row">
                @for (sc of problemScenarios(); track sc.key) {
                  <button mat-stroked-button [class.on]="d.scenario === sc.key" (click)="setScenario(d, sc.key)">
                    <mat-icon>{{ icon[sc.key] }}</mat-icon>{{ sc.label }}
                  </button>
                }
              </div>
            </div>
            <div>
              <div class="muted small">3–4. Alert ที่เกิดขึ้น และการรับทราบ</div>
              @for (a of activeAlerts(); track a.id) {
                <div class="alert-row">
                  <app-severity-chip [severity]="a.severity" />
                  <div class="grow">{{ a.message }}<div class="muted small">เริ่ม {{ a.detected_at | ago }}</div></div>
                  @if (a.acknowledged) { <span>✔ รับทราบโดย {{ a.acknowledged_by }}</span> }
                  @else { <button mat-flat-button (click)="ack(a, refresh)">รับทราบ</button> }
                </div>
              } @empty {
                <div class="muted">
                  @if (d.scenario !== 'normal') { รอ Rule ประเมิน (Alert เกิดเมื่อปัญหาคงอยู่ครบระยะเวลาที่ตั้งไว้ ~10–15 วินาที)... }
                  @else { ยังไม่มี Alert }
                </div>
              }
            </div>
            <div>
              <div class="muted small">5. กู้คืน</div>
              <button mat-flat-button class="ok-btn" [disabled]="d.scenario === 'normal'" (click)="setScenario(d, 'normal')">
                <mat-icon>healing</mat-icon>Recovery: กลับสู่ปกติ
              </button>
              <a mat-button [routerLink]="['/devices', d.id]">เปิดหน้า Device Detail</a>
            </div>
          </div>
        }
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header><mat-card-title>จำลองทั้งโซน</mat-card-title>
        <mat-card-subtitle>เช่น Production Line A ขาดการเชื่อมต่อทั้งไลน์ หรือ Collector ของโซนล่ม (Unknown)</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="walk-controls">
        <mat-form-field appearance="outline">
          <mat-label>Zone</mat-label>
          <mat-select [(ngModel)]="zone">
            @for (z of zones(); track z) { <mat-option [value]="z">{{ z }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Scenario</mat-label>
          <mat-select [(ngModel)]="zoneScenario">
            @for (sc of scenarios(); track sc.key) { <mat-option [value]="sc.key">{{ sc.label }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button [disabled]="!zone" (click)="applyZone()">ใช้กับทั้งโซน</button>
      </mat-card-content>
    </mat-card>

    <mat-card>
      <mat-card-header><mat-card-title>อุปกรณ์จำลองทั้งหมด</mat-card-title></mat-card-header>
      <mat-card-content class="table-scroll">
        <table class="simple-table">
          <thead><tr><th>อุปกรณ์</th><th>Zone</th><th>สถานะที่ระบบเห็น</th><th>Scenario ที่จำลอง</th><th>ตั้งค่าโดย</th></tr></thead>
          <tbody>
            @for (d of devices(); track d.id) {
              <tr [class.row-sim-active]="d.scenario !== 'normal'">
                <td><a [routerLink]="['/devices', d.id]">{{ d.name }}</a></td>
                <td>{{ d.zone }}</td>
                <td><app-state-chip [state]="d.state" [reason]="d.reason" /></td>
                <td>
                  <select class="inline-input" [ngModel]="d.scenario" (ngModelChange)="setScenario(d, $event)">
                    @for (sc of scenarios(); track sc.key) { <option [value]="sc.key">{{ sc.label }}</option> }
                  </select>
                </td>
                <td class="muted small">{{ d.scenario_updated_by }} · {{ d.scenario_updated_at | ago }}</td>
              </tr>
            }
          </tbody>
        </table>
      </mat-card-content>
    </mat-card>
  `,
})
export class DemoComponent {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  ack = injectAcknowledge();
  icon = SCENARIO_ICON;

  devices = signal<Device[]>([]);
  scenarios = signal<{ key: string; label: string }[]>([]);
  selectedId = signal<number | null>(null);
  deviceAlerts = signal<Alert[]>([]);
  zone = '';
  zoneScenario = 'offline';

  steps = [
    { key: 'normal', title: 'Normal', hint: 'อุปกรณ์ทำงานปกติ' },
    { key: 'problem', title: 'Problem', hint: 'จำลองปัญหา ค่าเริ่มผิดปกติ' },
    { key: 'alert', title: 'Alert', hint: 'Rule ตรวจพบ สร้าง Alert' },
    { key: 'ack', title: 'Acknowledge', hint: 'ผู้รับผิดชอบรับทราบ' },
    { key: 'recovery', title: 'Recovery', hint: 'กลับสู่ปกติ Alert ปิดเอง' },
  ];

  selected = computed(() => this.devices().find((d) => d.id === this.selectedId()) ?? null);
  zones = computed(() => [...new Set(this.devices().map((d) => d.zone))]);
  problemScenarios = computed(() => this.scenarios().filter((s) => s.key !== 'normal'));
  activeAlerts = computed(() => this.deviceAlerts().filter((a) => a.state === 'active'));

  step = computed<Step>(() => {
    const d = this.selected();
    if (!d) return 'normal';
    const active = this.activeAlerts();
    if (d.scenario === 'normal') {
      const recentlyResolved = this.deviceAlerts().some(
        (a) => a.resolved_at && Date.now() - new Date(a.resolved_at).getTime() < 120_000,
      );
      return active.length === 0 && recentlyResolved ? 'recovery' : 'normal';
    }
    if (active.length === 0) return 'problem';
    return active.every((a) => a.acknowledged) ? 'ack' : 'alert';
  });
  stepIndex = computed(() => this.steps.findIndex((s) => s.key === this.step()));

  refresh = poll(
    () => {
      const id = this.selectedId();
      return forkJoin([this.api.demoDevices(), id ? this.api.deviceAlerts(id) : of([] as Alert[])]);
    },
    ([devices, alerts]) => {
      this.devices.set(devices);
      this.deviceAlerts.set(alerts);
      if (this.selectedId() === null && devices.length) {
        this.selectedId.set(devices.find((d) => d.zone.startsWith('Production'))?.id ?? devices[0].id);
        this.refresh();
      }
    },
    3000,
  );

  constructor() {
    this.api.scenarios().subscribe((s) => this.scenarios.set(s));
  }

  setScenario(d: Device, scenario: string): void {
    this.api.setScenario(d.id, scenario).subscribe(() => {
      const label = this.scenarios().find((s) => s.key === scenario)?.label ?? scenario;
      this.snack.open(`${d.name}: ${label}`, 'ปิด', { duration: 2500 });
      this.refresh();
    });
  }

  applyZone(): void {
    this.api.setZoneScenario(this.zone, this.zoneScenario).subscribe(() => {
      this.snack.open(`ตั้งค่า ${this.zone} แล้ว`, 'ปิด', { duration: 2500 });
      this.refresh();
    });
  }

  reset(): void {
    this.api.resetDemo().subscribe((r) => {
      this.snack.open(`คืนค่าปกติ ${r.devices} อุปกรณ์`, 'ปิด', { duration: 2500 });
      this.refresh();
    });
  }
}
