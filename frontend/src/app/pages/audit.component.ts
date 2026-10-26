import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../core/api.service';
import { AuditLog } from '../core/models';
import { poll } from '../core/poll';
import { ThTimePipe } from '../shared/th-time.pipe';

@Component({
  selector: 'app-audit',
  imports: [MatCardModule, ThTimePipe],
  template: `
    <div class="page-head"><h1>Audit Log</h1><span class="muted">ใครทำอะไร เมื่อไร กับข้อมูลใด</span></div>
    <mat-card>
      <mat-card-content class="table-scroll">
        <table class="simple-table">
          <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>เป้าหมาย</th><th>รายละเอียด</th></tr></thead>
          <tbody>
            @for (l of logs(); track l.id) {
              <tr>
                <td>{{ l.at | thTime }}</td><td>{{ l.username }}</td><td class="mono">{{ l.action }}</td>
                <td>{{ l.target }}</td><td class="muted small detail">{{ l.detail }}</td>
              </tr>
            }
          </tbody>
        </table>
      </mat-card-content>
    </mat-card>
  `,
})
export class AuditComponent {
  private api = inject(ApiService);
  logs = signal<AuditLog[]>([]);

  constructor() {
    poll(() => this.api.auditLogs(), (l) => this.logs.set(l), 10000);
  }
}
