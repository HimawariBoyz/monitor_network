export type Role = 'viewer' | 'engineer' | 'admin';
export type DeviceState = 'online' | 'offline' | 'unknown';
export type Severity = 'critical' | 'high' | 'warning' | 'info';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

export interface Device {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  device_type: string;
  vendor: string;
  model: string;
  zone: string;
  group_name: string;
  description: string;
  monitoring_enabled: boolean;
  source: string;
  state: DeviceState;
  reason: string;
  last_seen_at: string | null;
  last_checked_at: string | null;
  state_changed_at: string | null;
  metrics: Record<string, number | undefined>;
  active_alerts: number;
  scenario?: string;
  scenario_updated_by?: string;
  scenario_updated_at?: string;
}

export interface Alert {
  id: number;
  device_id: number;
  device_name: string;
  zone: string;
  rule_id: number;
  rule_name: string;
  severity: Severity;
  message: string;
  state: 'active' | 'resolved';
  value: number | null;
  detected_at: string;
  resolved_at: string | null;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  ack_note: string | null;
  source: string;
}

export interface AlertRule {
  id: number;
  key: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  state_value: string | null;
  duration_seconds: number;
  severity: Severity;
  enabled: boolean;
  description: string;
}

export type Series = Record<string, [string, number][]>;

export interface Summary {
  generated_at: string;
  total_devices: number;
  states: Record<DeviceState, number>;
  zones: ({ zone: string } & Record<DeviceState, number>)[];
  active_alerts: number;
  unacknowledged_alerts: number;
  alerts_by_severity: Partial<Record<Severity, number>>;
  top_alerts: Alert[];
  recent_events: Alert[];
  collector: { name: string; last_beat: string | null; age_seconds: number | null; healthy: boolean };
  trend: Series;
  recent_audit: { at: string; username: string; action: string; target: string }[];
}

export interface Filters {
  zones: string[];
  groups: string[];
  types: string[];
}

export interface AuditLog {
  id: number;
  at: string;
  username: string;
  action: string;
  target: string;
  detail: string;
}

export const STATE_LABEL: Record<DeviceState, string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Unknown',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  warning: 'Warning',
  info: 'Info',
};

export const METRIC_LABEL: Record<string, string> = {
  latency_ms: 'Latency (ms)',
  packet_loss_pct: 'Packet Loss (%)',
  cpu_pct: 'CPU (%)',
  memory_pct: 'Memory (%)',
  traffic_in_mbps: 'Traffic In (Mbps)',
  traffic_out_mbps: 'Traffic Out (Mbps)',
  state: 'สถานะอุปกรณ์',
};
