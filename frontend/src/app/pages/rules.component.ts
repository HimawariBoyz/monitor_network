import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { AlertRule, METRIC_LABEL } from '../core/models';
import { SeverityChipComponent } from '../shared/chips';

@Component({
  selector: 'app-rules',
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
            MatSlideToggleModule, MatButtonModule, SeverityChipComponent],
  template: `
    <div class="page-head">
      <h1>Alert Rules</h1>
      <span class="muted">Alert เกิดเมื่อเงื่อนไขเป็นจริงต่อเนื่องครบ "ระยะเวลา" เพื่อลดการแจ้งเตือนซ้ำ/กระพริบ</span>
    </div>
    <mat-card>
      <mat-card-content class="table-scroll">
        <table class="simple-table">
          <thead><tr><th>เปิดใช้</th><th>Rule</th><th>เงื่อนไข</th><th>Threshold</th><th>ระยะเวลา (วินาที)</th>
            <th>Severity</th>@if (canEdit) { <th></th> }</tr></thead>
          <tbody>
            @for (r of rules(); track r.id) {
              <tr>
                <td><mat-slide-toggle [(ngModel)]="r.enabled" [disabled]="!canEdit" /></td>
                <td><b>{{ r.name }}</b><div class="muted small">{{ r.description }}</div></td>
                <td>{{ label[r.metric] }} {{ r.metric === 'state' ? '= ' + r.state_value : r.operator }}</td>
                <td>
                  @if (r.metric === 'state') { - } @else if (canEdit) {
                    <input class="inline-input" type="number" [(ngModel)]="r.threshold" />
                  } @else { {{ r.threshold }} }
                </td>
                <td>
                  @if (canEdit) { <input class="inline-input" type="number" min="0" [(ngModel)]="r.duration_seconds" /> }
                  @else { {{ r.duration_seconds }} }
                </td>
                <td>
                  @if (canEdit) {
                    <select class="inline-input" [(ngModel)]="r.severity">
                      @for (s of severities; track s) { <option [value]="s">{{ s }}</option> }
                    </select>
                  } @else { <app-severity-chip [severity]="r.severity" /> }
                </td>
                @if (canEdit) { <td><button mat-stroked-button (click)="save(r)">บันทึก</button></td> }
              </tr>
            }
          </tbody>
        </table>
        @if (!canEdit) { <p class="muted small">เฉพาะ Engineer และ Admin ที่ปรับ Threshold ได้</p> }
      </mat-card-content>
    </mat-card>
  `,
})
export class RulesComponent {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  canEdit = inject(AuthService).isEngineer();
  rules = signal<AlertRule[]>([]);
  label = METRIC_LABEL;
  severities = ['critical', 'high', 'warning', 'info'];

  constructor() {
    this.api.rules().subscribe((r) => this.rules.set(r));
  }

  save(r: AlertRule): void {
    const { threshold, duration_seconds, severity, enabled } = r;
    this.api.updateRule(r.id, { threshold: +threshold, duration_seconds: +duration_seconds, severity, enabled })
      .subscribe({
        next: () => this.snack.open(`บันทึก ${r.name} แล้ว`, 'ปิด', { duration: 3000 }),
        error: (e) => this.snack.open(e.error?.detail?.[0]?.msg ?? e.error?.detail ?? 'บันทึกไม่สำเร็จ', 'ปิด', { duration: 4000 }),
      });
  }
}
