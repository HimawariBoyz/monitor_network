import { Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import { ApiService } from '../core/api.service';
import { Summary } from '../core/models';
import { poll } from '../core/poll';
import { SeverityChipComponent } from '../shared/chips';
import { AgoPipe, ThTimePipe } from '../shared/th-time.pipe';
import { thaiTimeAxis, thaiTooltip } from '../shared/chart-time';
import { COLORS } from '../shared/colors';

@Component({
  selector: 'app-dashboard',
  imports: [MatCardModule, MatIconModule, RouterLink, NgxEchartsDirective, SeverityChipComponent,
            ThTimePipe, AgoPipe],
  template: `
    <div class="page-head">
      <h1>Overview Dashboard</h1>
      @if (s(); as s) {
        <span class="muted">อัปเดตทุก 5 วินาที · ล่าสุด {{ s.generated_at | thTime: 'HH:mm:ss' }}</span>
      }
    </div>
    @if (s(); as s) {
      <div class="kpis">
        <a class="kpi" routerLink="/devices">
          <div class="kpi-label">อุปกรณ์ทั้งหมด</div>
          <div class="kpi-value">{{ s.total_devices }}</div>
        </a>
        <a class="kpi kpi-online" routerLink="/devices" [queryParams]="{ state: 'online' }">
          <div class="kpi-label">Online</div>
          <div class="kpi-value">{{ s.states.online }}</div>
        </a>
        <a class="kpi kpi-offline" routerLink="/devices" [queryParams]="{ state: 'offline' }">
          <div class="kpi-label">Offline</div>
          <div class="kpi-value">{{ s.states.offline }}</div>
          <div class="kpi-hint">ตรวจแล้ว ไม่ตอบสนอง</div>
        </a>
        <a class="kpi kpi-unknown" routerLink="/devices" [queryParams]="{ state: 'unknown' }">
          <div class="kpi-label">Unknown</div>
          <div class="kpi-value">{{ s.states.unknown }}</div>
          <div class="kpi-hint">ข้อมูลหมดอายุ ไม่ทราบสถานะ</div>
        </a>
        <a class="kpi kpi-alert" routerLink="/alerts">
          <div class="kpi-label">Active Alerts</div>
          <div class="kpi-value">{{ s.active_alerts }}</div>
          <div class="kpi-hint">ยังไม่รับทราบ {{ s.unacknowledged_alerts }}</div>
        </a>
        <div class="kpi" [class.kpi-offline]="!s.collector.healthy">
          <div class="kpi-label">{{ s.collector.name }}</div>
          <div class="kpi-value small">
            <mat-icon [style.color]="s.collector.healthy ? colors.online : colors.offline">
              {{ s.collector.healthy ? 'sensors' : 'sensors_off' }}
            </mat-icon>
            {{ s.collector.healthy ? 'ทำงานปกติ' : 'ขาดการติดต่อ' }}
          </div>
          <div class="kpi-hint">ส่งข้อมูลล่าสุด {{ s.collector.last_beat | ago }}</div>
        </div>
      </div>

      <div class="grid-2">
        <mat-card>
          <mat-card-header><mat-card-title>สถานะอุปกรณ์</mat-card-title></mat-card-header>
          <mat-card-content><div echarts [options]="stateChart()" class="chart-sm"></div></mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-header><mat-card-title>สถานะตามโซน</mat-card-title></mat-card-header>
          <mat-card-content><div echarts [options]="zoneChart()" class="chart-sm"></div></mat-card-content>
        </mat-card>
      </div>

      <div class="grid-2">
        <mat-card>
          <mat-card-header>
            <mat-card-title>Active Alerts</mat-card-title>
            <a routerLink="/alerts" class="card-link">ดูทั้งหมด</a>
          </mat-card-header>
          <mat-card-content>
            @for (a of s.top_alerts; track a.id) {
              <a class="alert-row" [routerLink]="['/devices', a.device_id]">
                <app-severity-chip [severity]="a.severity" />
                <div class="grow">
                  <div>{{ a.message }}</div>
                  <div class="muted small">{{ a.zone }} · เริ่ม {{ a.detected_at | ago }}
                    @if (a.acknowledged) { · รับทราบโดย {{ a.acknowledged_by }} }
                  </div>
                </div>
                @if (a.acknowledged) { <mat-icon class="muted" title="รับทราบแล้ว">done_all</mat-icon> }
              </a>
            } @empty {
              <div class="empty"><mat-icon>verified</mat-icon> ไม่มี Alert ที่ยังเปิดอยู่</div>
            }
          </mat-card-content>
        </mat-card>
        <mat-card>
          <mat-card-header><mat-card-title>Latency เฉลี่ยทุกอุปกรณ์ (60 นาที)</mat-card-title></mat-card-header>
          <mat-card-content><div echarts [options]="trendChart()" class="chart-sm"></div></mat-card-content>
        </mat-card>
      </div>

      <mat-card>
        <mat-card-header><mat-card-title>เหตุการณ์ล่าสุด</mat-card-title></mat-card-header>
        <mat-card-content>
          <table class="simple-table">
            <thead><tr><th>เวลาเริ่ม</th><th>Severity</th><th>อุปกรณ์</th><th>เหตุการณ์</th><th>สถานะ</th></tr></thead>
            <tbody>
              @for (e of s.recent_events; track e.id) {
                <tr>
                  <td>{{ e.detected_at | thTime }}</td>
                  <td><app-severity-chip [severity]="e.severity" /></td>
                  <td><a [routerLink]="['/devices', e.device_id]">{{ e.device_name }}</a></td>
                  <td>{{ e.rule_name }}</td>
                  <td>
                    @if (e.state === 'active') { <span class="chip st-active">Active</span> }
                    @else { <span class="chip st-resolved">Resolved {{ e.resolved_at | thTime: 'HH:mm:ss' }}</span> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="muted">ยังไม่มีเหตุการณ์ ลองสร้างปัญหาจากหน้า Demo Control</td></tr>
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
export class DashboardComponent {
  private api = inject(ApiService);
  s = signal<Summary | null>(null);
  colors = COLORS;

  stateChart = computed<EChartsCoreOption>(() => {
    const s = this.s();
    if (!s) return {};
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['48%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          label: { formatter: '{b}: {c}', fontSize: 13 },
          labelLine: { length: 10, length2: 10 },
          data: [
            { name: 'Online', value: s.states.online, itemStyle: { color: COLORS.online } },
            { name: 'Offline', value: s.states.offline, itemStyle: { color: COLORS.offline } },
            { name: 'Unknown', value: s.states.unknown, itemStyle: { color: COLORS.unknown } },
          ],
        },
      ],
    };
  });

  zoneChart = computed<EChartsCoreOption>(() => {
    const s = this.s();
    if (!s) return {};
    const bar = (name: string, key: 'online' | 'offline' | 'unknown') => ({
      name,
      type: 'bar',
      stack: 'total',
      itemStyle: { color: COLORS[key] },
      data: s.zones.map((z) => z[key]),
    });
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0 },
      grid: { left: 130, right: 16, top: 8, bottom: 40 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: s.zones.map((z) => z.zone) },
      series: [bar('Online', 'online'), bar('Offline', 'offline'), bar('Unknown', 'unknown')],
    };
  });

  trendChart = computed<EChartsCoreOption>(() => {
    const s = this.s();
    if (!s) return {};
    return {
      tooltip: thaiTooltip(),
      legend: { bottom: 0 },
      grid: { left: 48, right: 48, top: 16, bottom: 48 },
      xAxis: thaiTimeAxis,
      yAxis: [
        { type: 'value', name: 'ms' },
        { type: 'value', name: '%', splitLine: { show: false } },
      ],
      series: [
        { name: 'Latency (ms)', type: 'line', showSymbol: false, data: s.trend['latency_ms'] ?? [],
          itemStyle: { color: COLORS.series[0] } },
        { name: 'Packet Loss (%)', type: 'line', showSymbol: false, yAxisIndex: 1,
          data: s.trend['packet_loss_pct'] ?? [], itemStyle: { color: COLORS.series[1] } },
      ],
    };
  });

  constructor() {
    poll(() => this.api.summary(), (s) => this.s.set(s));
  }
}
