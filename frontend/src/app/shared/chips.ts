import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DeviceState, SEVERITY_LABEL, STATE_LABEL, Severity } from '../core/models';

const STATE_ICON: Record<DeviceState, string> = {
  online: 'check_circle',
  offline: 'cancel',
  unknown: 'help',
};

@Component({
  selector: 'app-state-chip',
  imports: [MatIconModule, MatTooltipModule],
  template: `<span class="chip state-{{ state() }}" [matTooltip]="reason()">
    <mat-icon inline>{{ icon[state()] }}</mat-icon>{{ label[state()] }}
  </span>`,
})
export class StateChipComponent {
  state = input.required<DeviceState>();
  reason = input<string>('');
  icon = STATE_ICON;
  label = STATE_LABEL;
}

@Component({
  selector: 'app-severity-chip',
  template: `<span class="chip sev-{{ severity() }}">{{ label[severity()] }}</span>`,
})
export class SeverityChipComponent {
  severity = input.required<Severity>();
  label = SEVERITY_LABEL;
}

@Component({
  selector: 'app-sim-badge',
  imports: [MatTooltipModule],
  template: `@if (source() === 'simulation') {
    <span class="chip sim" matTooltip="ข้อมูลจำลอง (source=simulation) ไม่ได้มาจากอุปกรณ์จริง">SIM</span>
  }`,
})
export class SimBadgeComponent {
  source = input<string>('simulation');
}
