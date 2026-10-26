import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="login-wrap">
      <mat-card class="login-card">
        <div class="brand login-brand">
          <mat-icon>lan</mat-icon>
          <div>
            <div class="brand-title">Factory NetMon</div>
            <div class="brand-sub">ระบบเฝ้าระวังเครือข่ายโรงงาน</div>
          </div>
        </div>
        <form (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>ชื่อผู้ใช้</mat-label>
            <input matInput name="username" [(ngModel)]="username" autocomplete="username" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>รหัสผ่าน</mat-label>
            <input matInput type="password" name="password" [(ngModel)]="password"
                   autocomplete="current-password" required />
          </mat-form-field>
          @if (error()) {
            <div class="error-text">{{ error() }}</div>
          }
          <button mat-flat-button type="submit" [disabled]="busy()">เข้าสู่ระบบ</button>
        </form>
        <div class="demo-accounts">
          <div class="muted">บัญชีสำหรับ Demo (คลิกเพื่อกรอก)</div>
          @for (a of accounts; track a.u) {
            <button mat-stroked-button type="button" (click)="username = a.u; password = a.p">
              {{ a.u }} <span class="muted">· {{ a.desc }}</span>
            </button>
          }
        </div>
      </mat-card>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  busy = signal(false);
  error = signal('');
  accounts = [
    { u: 'admin', p: 'admin123', desc: 'จัดการทุกอย่าง + Audit Log' },
    { u: 'engineer', p: 'engineer123', desc: 'รับทราบ Alert, ปรับ Threshold, Demo Control' },
    { u: 'viewer', p: 'viewer123', desc: 'ดูอย่างเดียว' },
  ];

  submit(): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (e) => {
        this.error.set(e.error?.detail ?? 'เข้าสู่ระบบไม่สำเร็จ');
        this.busy.set(false);
      },
    });
  }
}
