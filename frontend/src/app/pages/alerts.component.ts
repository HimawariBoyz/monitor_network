import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Alert, Severity } from '../core/models';
import { poll } from '../core/poll';
import { injectAcknowledge } from '../shared/ack';
import { SeverityChipComponent, SimBadgeComponent } from '../shared/chips';
import { ThTimePipe, duration } from '../shared/th-time.pipe';

const TABS = [
  { state: 'active', label: 'Active' },
  { state: 'unacknowledged', label: 'ยังไม่รับทราบ' },
  { state: 'acknowledged', label: 'Acknowledged' },
  { state: 'resolved', label: 'Resolved' },
  { state: 'all', label: 'ทั้งหมด' },
];

@Component({
  selector: 'app-alerts',
  imports: [RouterLink, MatCardModule, MatTabsModule, MatButtonModule, MatIconModule,
            SeverityChipComponent, SimBadgeComponent, ThTimePipe],
  template: `
    <div class="page-head">
      <h1>Alerts</h1>
      <span class="muted">Alert จะปิดเอง (Resolved) เมื่อค่ากลับสู่ปกติ · การรับทราบ (Acknowledge) ไม่ได้ปิด Alert</span>
    </div>
    <mat-card>
      <mat-tab-group [selectedIndex]="tab()" (selectedIndexChange)="select($event)" animationDuration="0">
        @for (t of tabs; track t.state) { <mat-tab [label]="t.label" /> }
      </mat-tab-group>
      <mat-card-content>
        <div class="sev-filter">
          @for (s of severities; track s) {
            <button mat-stroked-button [class.on]="severity() === s" (click)="toggleSeverity(s)">
              <app-severity-chip [severity]="s" /> {{ counts()[s] ?? 0 }}
            </button>
          }
        </div>
        <div class="table-scroll">
          <table class="simple-table">
            <thead><tr><th>Severity</th><th>อุปกรณ์</th><th>Zone</th><th>เหตุการณ์</th><th>เริ่ม</th>
              <th>สิ้นสุด</th><th>ระยะเวลา</th><th>สถานะ</th><th>การรับทราบ</th></tr></thead>
            <tbody>
              @for (a of shown(); track a.id) {
                <tr [class.row-unacked]="a.state === 'active' && !a.acknowledged">
                  <td><app-severity-chip [severity]="a.severity" /></td>
                  <td><a [routerLink]="['/devices', a.device_id]">{{ a.device_name }}</a>
                    <app-sim-badge [source]="a.source" /></td>
                  <td>{{ a.zone }}</td>
                  <td>{{ a.message }}</td>
                  <td>{{ a.detected_at | thTime }}</td>
                  <td>{{ a.resolved_at | thTime }}</td>
                  <td>{{ dur(a) }}</td>
                  <td><span class="chip" [class.st-active]="a.state === 'active'"
                            [class.st-resolved]="a.state === 'resolved'">{{ a.state }}</span></td>
                  <td>
                    @if (a.acknowledged) {
                      <div>✔ {{ a.acknowledged_by }} · {{ a.acknowledged_at | thTime: 'dd/MM HH:mm' }}</div>
                      @if (a.ack_note) { <div class="muted small">{{ a.ack_note }}</div> }
                    } @else if (auth.isEngineer()) {
                      <button mat-flat-button (click)="ack(a, refresh)">รับทราบ</button>
                    } @else { <span class="muted">ยังไม่รับทราบ</span> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="muted">ไม่มี Alert ในหมวดนี้</td></tr>
              }
            </tbody>
          </table>
        </div>
      </mat-card-content>
    </mat-card>
  `,
})
export class AlertsComponent {
  private api = inject(ApiService);
  auth = inject(AuthService);
  ack = injectAcknowledge();
  tabs = TABS;
  severities: Severity[] = ['critical', 'high', 'warning', 'info'];
  tab = signal(0);
  severity = signal<Severity | null>(null);
  alerts = signal<Alert[]>([]);
  shown = computed(() => this.alerts().filter((a) => !this.severity() || a.severity === this.severity()));
  counts = computed(() =>
    this.alerts().reduce<Record<string, number | undefined>>((acc, a) => ({ ...acc, [a.severity]: (acc[a.severity] ?? 0) + 1 }), {}),
  );
  refresh = poll(() => this.api.alerts(TABS[this.tab()].state), (a) => this.alerts.set(a));

  select(index: number): void {
    this.tab.set(index);
    this.alerts.set([]);
    this.refresh();
  }

  toggleSeverity(s: Severity): void {
    this.severity.set(this.severity() === s ? null : s);
  }

  dur(a: Alert): string {
    return duration(a.detected_at, a.resolved_at);
  }
}
