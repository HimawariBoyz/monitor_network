import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Alert, AlertRule, AuditLog, Device, Filters, Series, Summary } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  summary() {
    return this.http.get<Summary>('/api/dashboard/summary');
  }

  devices(filters: Record<string, string | null | undefined> = {}) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<Device[]>('/api/devices', { params });
  }

  deviceFilters() {
    return this.http.get<Filters>('/api/devices/filters');
  }

  device(id: number) {
    return this.http.get<Device>(`/api/devices/${id}`);
  }

  deviceMetrics(id: number, minutes: number) {
    return this.http.get<{ bucket_seconds: number; series: Series }>(`/api/devices/${id}/metrics`, {
      params: { minutes },
    });
  }

  deviceAlerts(id: number) {
    return this.http.get<Alert[]>(`/api/devices/${id}/alerts`);
  }

  saveDevice(device: Partial<Device>, id?: number) {
    return id
      ? this.http.put<Device>(`/api/devices/${id}`, device)
      : this.http.post<Device>('/api/devices', device);
  }

  deleteDevice(id: number) {
    return this.http.delete<void>(`/api/devices/${id}`);
  }

  alerts(state: string) {
    return this.http.get<Alert[]>('/api/alerts', { params: { state } });
  }

  acknowledge(id: number, note: string) {
    return this.http.post<Alert>(`/api/alerts/${id}/ack`, { note });
  }

  rules() {
    return this.http.get<AlertRule[]>('/api/alert-rules');
  }

  updateRule(id: number, body: Partial<AlertRule>) {
    return this.http.put<AlertRule>(`/api/alert-rules/${id}`, body);
  }

  scenarios() {
    return this.http.get<{ key: string; label: string }[]>('/api/demo/scenarios');
  }

  demoDevices() {
    return this.http.get<Device[]>('/api/demo/devices');
  }

  setScenario(deviceId: number, scenario: string) {
    return this.http.post(`/api/demo/devices/${deviceId}/scenario`, { scenario });
  }

  setZoneScenario(zone: string, scenario: string) {
    return this.http.post(`/api/demo/zones/${encodeURIComponent(zone)}/scenario`, { scenario });
  }

  resetDemo() {
    return this.http.post<{ devices: number }>('/api/demo/reset', {});
  }

  auditLogs() {
    return this.http.get<AuditLog[]>('/api/audit-logs');
  }
}
