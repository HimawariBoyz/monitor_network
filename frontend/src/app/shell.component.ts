import { Component, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { poll } from './core/poll';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatTooltipModule,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav [mode]="mobile() ? 'over' : 'side'" [opened]="!mobile()" #nav class="nav">
        <div class="brand">
          <mat-icon>lan</mat-icon>
          <div>
            <div class="brand-title">Factory NetMon</div>
            <div class="brand-sub">Network Monitoring · Phase 1</div>
          </div>
        </div>
        <mat-nav-list>
          @for (item of menu; track item.link) {
            @if (!item.role || auth.hasRole(item.role)) {
              <a mat-list-item [routerLink]="item.link" routerLinkActive="active"
                 (click)="mobile() && nav.close()">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>
                  {{ item.label }}
                  @if (item.link === '/alerts' && unacked() > 0) {
                    <span class="nav-count">{{ unacked() }}</span>
                  }
                </span>
              </a>
            }
          }
        </mat-nav-list>
        <div class="nav-foot">
          <span class="chip sim">SIMULATION MODE</span>
          <p>ข้อมูลทั้งหมดเป็นข้อมูลจำลอง ไม่ได้เชื่อมต่ออุปกรณ์จริงในโรงงาน</p>
        </div>
      </mat-sidenav>
      <mat-sidenav-content>
        <mat-toolbar class="topbar">
          @if (mobile()) {
            <button mat-icon-button (click)="nav.toggle()"><mat-icon>menu</mat-icon></button>
          }
          <span class="spacer"></span>
          <button mat-button [matMenuTriggerFor]="userMenu">
            <mat-icon>account_circle</mat-icon>
            {{ auth.user()?.full_name }}
            <span class="role-tag">{{ auth.user()?.role }}</span>
          </button>
          <mat-menu #userMenu="matMenu">
            <button mat-menu-item (click)="auth.logout()"><mat-icon>logout</mat-icon>ออกจากระบบ</button>
          </mat-menu>
        </mat-toolbar>
        <main class="content"><router-outlet /></main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
})
export class ShellComponent {
  auth = inject(AuthService);
  private api = inject(ApiService);
  mobile = signal(false);
  unacked = signal(0);

  menu = [
    { link: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
    { link: '/devices', icon: 'router', label: 'Devices' },
    { link: '/alerts', icon: 'notifications_active', label: 'Alerts' },
    { link: '/rules', icon: 'rule', label: 'Alert Rules' },
    { link: '/demo', icon: 'science', label: 'Demo Control', role: 'engineer' as const },
    { link: '/audit', icon: 'history', label: 'Audit Log', role: 'admin' as const },
  ];

  constructor() {
    inject(BreakpointObserver)
      .observe('(max-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((r) => this.mobile.set(r.matches));
    poll(
      () => this.api.alerts('unacknowledged'),
      (alerts) => this.unacked.set(alerts.length),
    );
  }
}
