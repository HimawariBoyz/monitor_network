import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';
import { ShellComponent } from './shell.component';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'devices',
        title: 'Devices',
        loadComponent: () => import('./pages/devices.component').then((m) => m.DevicesComponent),
      },
      {
        path: 'devices/:id',
        title: 'Device Detail',
        loadComponent: () => import('./pages/device-detail.component').then((m) => m.DeviceDetailComponent),
      },
      {
        path: 'alerts',
        title: 'Alerts',
        loadComponent: () => import('./pages/alerts.component').then((m) => m.AlertsComponent),
      },
      {
        path: 'rules',
        title: 'Alert Rules',
        loadComponent: () => import('./pages/rules.component').then((m) => m.RulesComponent),
      },
      {
        path: 'demo',
        title: 'Demo Control',
        canActivate: [roleGuard('engineer')],
        loadComponent: () => import('./pages/demo.component').then((m) => m.DemoComponent),
      },
      {
        path: 'audit',
        title: 'Audit Log',
        canActivate: [roleGuard('admin')],
        loadComponent: () => import('./pages/audit.component').then((m) => m.AuditComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
