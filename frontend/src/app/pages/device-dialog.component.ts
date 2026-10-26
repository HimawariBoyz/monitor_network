import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../core/api.service';
import { Device, Filters } from '../core/models';

@Component({
  selector: 'app-device-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
            MatButtonModule, MatSlideToggleModule, MatAutocompleteModule],
  template: `
    <h2 mat-dialog-title>{{ data.device ? 'แก้ไข ' + data.device.name : 'เพิ่มอุปกรณ์ (จำลอง)' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form-grid">
        <mat-form-field appearance="outline"><mat-label>ชื่ออุปกรณ์</mat-label>
          <input matInput formControlName="name" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Hostname</mat-label>
          <input matInput formControlName="hostname" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>IP Address</mat-label>
          <input matInput formControlName="ip_address" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>ประเภท</mat-label>
          <mat-select formControlName="device_type">
            @for (t of data.filters?.types ?? []; track t) { <mat-option [value]="t">{{ t }}</mat-option> }
          </mat-select></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Vendor</mat-label>
          <input matInput formControlName="vendor" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Model</mat-label>
          <input matInput formControlName="model" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Zone / Location</mat-label>
          <input matInput formControlName="zone" [matAutocomplete]="zones" />
          <mat-autocomplete #zones>
            @for (z of data.filters?.zones ?? []; track z) { <mat-option [value]="z">{{ z }}</mat-option> }
          </mat-autocomplete></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Group</mat-label>
          <input matInput formControlName="group_name" [matAutocomplete]="groups" />
          <mat-autocomplete #groups>
            @for (g of data.filters?.groups ?? []; track g) { <mat-option [value]="g">{{ g }}</mat-option> }
          </mat-autocomplete></mat-form-field>
        <mat-form-field appearance="outline" class="span-2"><mat-label>รายละเอียด</mat-label>
          <input matInput formControlName="description" /></mat-form-field>
        <mat-slide-toggle formControlName="monitoring_enabled" class="span-2">เปิดการ Monitor</mat-slide-toggle>
      </form>
      <p class="muted small">Phase 1: อุปกรณ์ใหม่ทุกตัวเป็นอุปกรณ์จำลอง (source=simulation) และจะเริ่มมีข้อมูลในรอบถัดไป</p>
      @if (error()) { <div class="error-text">{{ error() }}</div> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [disabled]="form.invalid" (click)="save()">บันทึก</button>
    </mat-dialog-actions>
  `,
})
export class DeviceDialogComponent {
  data = inject<{ device?: Device; filters: Filters | null }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<DeviceDialogComponent>);
  error = signal('');

  form = inject(FormBuilder).nonNullable.group({
    name: [this.data.device?.name ?? '', Validators.required],
    hostname: [this.data.device?.hostname ?? '', Validators.required],
    ip_address: [this.data.device?.ip_address ?? '', [Validators.required,
      Validators.pattern(/^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/)]],
    device_type: [this.data.device?.device_type ?? 'switch', Validators.required],
    vendor: [this.data.device?.vendor ?? ''],
    model: [this.data.device?.model ?? ''],
    zone: [this.data.device?.zone ?? '', Validators.required],
    group_name: [this.data.device?.group_name ?? ''],
    description: [this.data.device?.description ?? ''],
    monitoring_enabled: [this.data.device?.monitoring_enabled ?? true],
  });

  save(): void {
    this.api.saveDevice(this.form.getRawValue(), this.data.device?.id).subscribe({
      next: () => this.ref.close(true),
      error: (e) => this.error.set(typeof e.error?.detail === 'string' ? e.error.detail : 'บันทึกไม่สำเร็จ'),
    });
  }
}
