import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Device, Filters } from '../core/models';
import { poll } from '../core/poll';
import { SimBadgeComponent, StateChipComponent } from '../shared/chips';
import { AgoPipe } from '../shared/th-time.pipe';
import { DeviceDialogComponent } from './device-dialog.component';

@Component({
  selector: 'app-devices',
  imports: [FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
            MatButtonModule, MatIconModule, MatTooltipModule, StateChipComponent, SimBadgeComponent, AgoPipe],
  template: `
    <div class="page-head">
      <h1>Devices</h1>
      <span class="spacer"></span>
      @if (auth.isAdmin()) {
        <button mat-flat-button (click)="edit()"><mat-icon>add</mat-icon>เพิ่มอุปกรณ์</button>
      }
    </div>
    <mat-card>
      <mat-card-content>
        <div class="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="grow">
            <mat-label>ค้นหา ชื่อ / IP / Vendor / รุ่น</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [(ngModel)]="f.q" (ngModelChange)="apply()" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Location / Zone</mat-label>
            <mat-select [(ngModel)]="f.zone" (ngModelChange)="apply()">
              <mat-option [value]="''">ทั้งหมด</mat-option>
              @for (z of filters()?.zones; track z) { <mat-option [value]="z">{{ z }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Group</mat-label>
            <mat-select [(ngModel)]="f.group_name" (ngModelChange)="apply()">
              <mat-option [value]="''">ทั้งหมด</mat-option>
              @for (g of filters()?.groups; track g) { <mat-option [value]="g">{{ g }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>ประเภท</mat-label>
            <mat-select [(ngModel)]="f.device_type" (ngModelChange)="apply()">
              <mat-option [value]="''">ทั้งหมด</mat-option>
              @for (t of filters()?.types; track t) { <mat-option [value]="t">{{ t }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>สถานะ</mat-label>
            <mat-select [(ngModel)]="f.state" (ngModelChange)="apply()">
              <mat-option [value]="''">ทั้งหมด</mat-option>
              <mat-option value="online">Online</mat-option>
              <mat-option value="offline">Offline</mat-option>
              <mat-option value="unknown">Unknown</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <div class="table-scroll">
          <table class="simple-table hover">
            <thead>
              <tr>
                <th>สถานะ</th><th>ชื่ออุปกรณ์</th><th>IP</th><th>ประเภท</th><th>Vendor / Model</th>
                <th>Zone</th><th>Group</th><th class="num">Latency</th><th class="num">Loss</th>
                <th class="num">CPU</th><th>Alerts</th><th>ตรวจล่าสุด</th>
                @if (auth.isAdmin()) { <th></th> }
              </tr>
            </thead>
            <tbody>
              @for (d of devices(); track d.id) {
                <tr (click)="open(d)">
                  <td><app-state-chip [state]="d.state" [reason]="d.reason" /></td>
                  <td class="nowrap"><a [routerLink]="['/devices', d.id]" (click)="$event.stopPropagation()"><b>{{ d.name }}</b></a>
                    <app-sim-badge [source]="d.source" />
                    @if (!d.monitoring_enabled) { <span class="chip st-resolved">ปิด Monitor</span> }</td>
                  <td class="mono">{{ d.ip_address }}</td>
                  <td>{{ d.device_type }}</td>
                  <td class="nowrap">{{ d.vendor }} {{ d.model }}</td>
                  <td class="nowrap">{{ d.zone }}</td>
                  <td>{{ d.group_name }}</td>
                  <td class="num">{{ d.state === 'online' ? (d.metrics['latency_ms'] ?? '-') + ' ms' : '-' }}</td>
                  <td class="num">{{ d.metrics['packet_loss_pct'] ?? '-' }}%</td>
                  <td class="num">{{ d.state === 'online' ? (d.metrics['cpu_pct'] ?? '-') + '%' : '-' }}</td>
                  <td>@if (d.active_alerts) { <span class="chip st-active">{{ d.active_alerts }}</span> }</td>
                  <td class="muted nowrap">{{ d.last_checked_at | ago }}</td>
                  @if (auth.isAdmin()) {
                    <td class="actions" (click)="$event.stopPropagation()">
                      <button mat-icon-button matTooltip="แก้ไข" (click)="edit(d)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button matTooltip="ลบ" (click)="remove(d)"><mat-icon>delete</mat-icon></button>
                    </td>
                  }
                </tr>
              } @empty {
                <tr><td colspan="13" class="muted">ไม่พบอุปกรณ์ตามเงื่อนไข</td></tr>
              }
            </tbody>
          </table>
        </div>
        <div class="muted small">แสดง {{ devices().length }} รายการ</div>
      </mat-card-content>
    </mat-card>
  `,
})
export class DevicesComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  auth = inject(AuthService);

  devices = signal<Device[]>([]);
  filters = signal<Filters | null>(null);
  f = { q: '', zone: '', group_name: '', device_type: '', state: '' };
  private refresh: () => void;

  constructor() {
    const qp = inject(ActivatedRoute).snapshot.queryParamMap;
    for (const key of Object.keys(this.f) as (keyof typeof this.f)[]) {
      this.f[key] = qp.get(key) ?? '';
    }
    this.loadFilters();
    this.refresh = poll(() => this.api.devices(this.f), (d) => this.devices.set(d));
  }

  apply(): void {
    this.router.navigate([], { queryParams: { ...this.f }, replaceUrl: true });
    this.refresh();
  }

  open(d: Device): void {
    this.router.navigate(['/devices', d.id]);
  }

  edit(device?: Device): void {
    this.dialog
      .open(DeviceDialogComponent, { data: { device, filters: this.filters() }, width: '640px' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open('บันทึกอุปกรณ์แล้ว', 'ปิด', { duration: 3000 });
          this.loadFilters();
          this.refresh();
        }
      });
  }

  remove(d: Device): void {
    if (!confirm(`ลบอุปกรณ์ ${d.name}? ประวัติ Metrics และ Alerts ของอุปกรณ์นี้จะถูกลบด้วย`)) return;
    this.api.deleteDevice(d.id).subscribe(() => {
      this.snack.open(`ลบ ${d.name} แล้ว`, 'ปิด', { duration: 3000 });
      this.refresh();
    });
  }

  private loadFilters(): void {
    this.api.deviceFilters().subscribe((f) => this.filters.set(f));
  }
}
