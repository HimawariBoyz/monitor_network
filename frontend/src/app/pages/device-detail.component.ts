import { UpperCasePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { forkJoin } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Alert, AlertRule, Device, Series } from '../core/models';
import { poll } from '../core/poll';
import { injectAcknowledge } from '../shared/ack';
import { SeverityChipComponent, SimBadgeComponent, StateChipComponent } from '../shared/chips';
import { thaiTimeAxis, thaiTooltip } from '../shared/chart-time';
import { COLORS } from '../shared/colors';
import { AgoPipe, ThTimePipe, duration } from '../shared/th-time.pipe';

interface ChartDef {
  title: string;
  metrics: { key: string; name: string }[];
  unit: string;
  max?: number;
}

const CHARTS: ChartDef[] = [
  { title: 'Latency', unit: 'ms', metrics: [{ key: 'latency_ms', name: 'Latency' }] },
  { title: 'Packet Loss', unit: '%', max: 100, metrics: [{ key: 'packet_loss_pct', name: 'Packet Loss' }] },
  { title: 'CPU / Memory', unit: '%', max: 100,
    metrics: [{ key: 'cpu_pct', name: 'CPU' }, { key: 'memory_pct', name: 'Memory' }] },
  { title: 'Interface Traffic', unit: 'Mbps',
    metrics: [{ key: 'traffic_in_mbps', name: 'In' }, { key: 'traffic_out_mbps', name: 'Out' }] },
];

@Component({
  selector: 'app-device-detail',
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, MatButtonToggleModule,
            NgxEchartsDirective, StateChipComponent, SeverityChipComponent, SimBadgeComponent, UpperCasePipe,
            ThTimePipe, AgoPipe],
  template: `
    <a routerLink="/devices" class="back"><mat-icon inline>arrow_back</mat-icon> Devices</a>
    @if (device(); as d) {
      <div class="page-head">
        <h1>{{ d.name }}</h1>
        <app-state-chip [state]="d.state" [reason]="d.reason" />
        <app-sim-badge [source]="d.source" />
      </div>
      <div class="grid-3">
        <mat-card>
          <mat-card-header><mat-card-title>ข้อมูลอุปกรณ์</mat-card-title></mat-card-header>
          <mat-card-content>
            <dl class="kv">
              <dt>Hostname</dt><dd class="mono">{{ d.hostname }}</dd>
              <dt>IP Address</dt><dd class="mono">{{ d.ip_address }}</dd>
              <dt>ประเภท</dt><dd>{{ d.device_type }}</dd>
              <dt>Vendor / Model</dt><dd>{{ d.vendor }} {{ d.model }}</dd>
              <dt>Zone</dt><dd>{{ d.zone }}</dd>
              <dt>Group</dt><dd>{{ d.group_name }}</dd>
              <dt>แหล่งข้อมูล</dt><dd>{{ d.source }}</dd>
            </dl>
          </mat-card-content>
        </mat-card>
        <mat-card class="state-card state-border-{{ d.state }}">
          <mat-card-header><mat-card-title>สถานะ</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="state-big state-{{ d.state }}">{{ d.state | uppercase }}</div>
            <p>{{ d.reason }}</p>
            <dl class="kv">
              <dt>เปลี่ยนสถานะเมื่อ</dt><dd>{{ d.state_changed_at | thTime }}</dd>
              <dt>ตอบสนองล่าสุด</dt><dd>{{ d.last_seen_at | thTime }} ({{ d.last_seen_at | ago }})</dd>
              <dt>ตรวจล่าสุด</dt><dd>{{ d.last_checked_at | thTime }} ({{ d.last_checked_at | ago }})</dd>
            </dl>
            @if (d.state === 'unknown') {
              <p class="muted small">Unknown = ไม่มีข้อมูลใหม่ จึงยังสรุปไม่ได้ว่าอุปกรณ์เสีย
                (อาจเป็นปัญหาที่ Collector หรือเส้นทางข้อมูล)</p>
            }
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-header><mat-card-title>ค่าล่าสุด</mat-card-title></mat-card-header>
          <mat-card-content>
            <div class="metric-tiles">
              @for (m of tiles; track m.key) {
                <div class="metric-tile" [class.stale]="d.state !== 'online'">
                  <div class="muted small">{{ m.label }}</div>
                  <div class="metric-value">{{ d.metrics[m.key] ?? '-' }}<small>{{ m.unit }}</small></div>
                </div>
              }
            </div>
            @if (d.state !== 'online') {
              <p class="muted small">ค่าที่แสดงเป็นค่าล่าสุดที่ได้รับก่อนอุปกรณ์ขาดการติดต่อ</p>
            }
          </mat-card-content>
        </mat-card>
      </div>

      <div class="page-head">
        <h2>กราฟ Metrics</h2>
        <span class="spacer"></span>
        <mat-button-toggle-group [value]="minutes()" (change)="minutes.set($event.value)">
          <mat-button-toggle [value]="15">15 นาที</mat-button-toggle>
          <mat-button-toggle [value]="60">1 ชม.</mat-button-toggle>
          <mat-button-toggle [value]="360">6 ชม.</mat-button-toggle>
          <mat-button-toggle [value]="1440">24 ชม.</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <div class="grid-2">
        @for (c of charts(); track $index) {
          <mat-card>
            <mat-card-header><mat-card-title>{{ chartDefs[$index].title }}</mat-card-title></mat-card-header>
            <mat-card-content><div echarts [options]="c" class="chart"></div></mat-card-content>
          </mat-card>
        }
      </div>

      <mat-card>
        <mat-card-header><mat-card-title>ประวัติเหตุการณ์ของอุปกรณ์</mat-card-title></mat-card-header>
        <mat-card-content class="table-scroll">
          <table class="simple-table">
            <thead><tr><th>Severity</th><th>เหตุการณ์</th><th>เริ่ม</th><th>สิ้นสุด</th><th>ระยะเวลา</th>
              <th>สถานะ</th><th>การรับทราบ</th></tr></thead>
            <tbody>
              @for (a of alerts(); track a.id) {
                <tr>
                  <td><app-severity-chip [severity]="a.severity" /></td>
                  <td>{{ a.message }}</td>
                  <td>{{ a.detected_at | thTime }}</td>
                  <td>{{ a.resolved_at | thTime }}</td>
                  <td>{{ dur(a) }}</td>
                  <td><span class="chip" [class.st-active]="a.state === 'active'"
                            [class.st-resolved]="a.state === 'resolved'">{{ a.state }}</span></td>
                  <td>
                    @if (a.acknowledged) {
                      <span title="{{ a.ack_note ?? '' }}">✔ {{ a.acknowledged_by }} · {{ a.acknowledged_at | thTime: 'HH:mm' }}</span>
                    } @else if (auth.isEngineer()) {
                      <button mat-stroked-button (click)="ack(a, reload)">รับทราบ</button>
                    } @else { - }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="muted">ยังไม่มีเหตุการณ์</td></tr>
              }
            </tbody>
          </table>
        </mat-card-content>
      </mat-card>
    } @else {
      <div class="muted">กำลังโหลด...</div>
    }
  `,
})
export class DeviceDetailComponent {
  id = input.required<string>();
  private api = inject(ApiService);
  auth = inject(AuthService);
  ack = injectAcknowledge();

  device = signal<Device | null>(null);
  alerts = signal<Alert[]>([]);
  series = signal<Series>({});
  rules = signal<AlertRule[]>([]);
  minutes = signal(60);
  chartDefs = CHARTS;
  tiles = [
    { key: 'latency_ms', label: 'Latency', unit: ' ms' },
    { key: 'packet_loss_pct', label: 'Packet Loss', unit: '%' },
    { key: 'cpu_pct', label: 'CPU', unit: '%' },
    { key: 'memory_pct', label: 'Memory', unit: '%' },
    { key: 'traffic_in_mbps', label: 'Traffic In', unit: ' Mbps' },
    { key: 'traffic_out_mbps', label: 'Traffic Out', unit: ' Mbps' },
  ];
  reload: () => void;

  charts = computed<EChartsCoreOption[]>(() => {
    const series = this.series();
    const rules = this.rules();
    return CHARTS.map((def) => {
      const thresholds = rules.filter((r) => r.enabled && def.metrics.some((m) => m.key === r.metric));
      return {
        tooltip: thaiTooltip(def.unit),
        legend: { show: def.metrics.length > 1, bottom: 0 },
        grid: { left: 48, right: 16, top: 24, bottom: def.metrics.length > 1 ? 48 : 28 },
        xAxis: thaiTimeAxis,
        yAxis: { type: 'value', name: def.unit, max: def.max },
        series: def.metrics.map((m, i) => ({
          name: m.name,
          type: 'line',
          showSymbol: false,
          sampling: 'lttb',
          areaStyle: def.metrics.length === 1 ? { opacity: 0.08 } : undefined,
          itemStyle: { color: COLORS.series[(CHARTS.indexOf(def) + i) % COLORS.series.length] },
          data: series[m.key] ?? [],
          markLine: i === 0 && thresholds.length
            ? {
                symbol: 'none',
                lineStyle: { color: COLORS.offline, type: 'dashed' },
                label: { formatter: (p: { value: number }) => `Threshold ${p.value}` , position: 'insideEndTop' },
                data: thresholds.map((r) => ({ yAxis: r.threshold })),
              }
            : undefined,
        })),
      };
    });
  });

  constructor() {
    this.api.rules().subscribe((r) => this.rules.set(r));
    // device + alert list every 5s; charts refresh with the same cadence
    this.reload = poll(
      () => forkJoin([this.api.device(+this.id()), this.api.deviceAlerts(+this.id()),
                      this.api.deviceMetrics(+this.id(), this.minutes())]),
      ([d, a, m]) => {
        this.device.set(d);
        this.alerts.set(a);
        this.series.set(m.series);
      },
    );
    toObservable(this.minutes).subscribe(() => this.reload());
  }

  dur(a: Alert): string {
    return duration(a.detected_at, a.resolved_at);
  }
}
