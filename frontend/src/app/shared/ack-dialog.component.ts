import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Alert } from '../core/models';

@Component({
  selector: 'app-ack-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>รับทราบ Alert</h2>
    <mat-dialog-content>
      <p>{{ alert.message }}</p>
      <mat-form-field appearance="outline" class="full">
        <mat-label>บันทึก (ไม่บังคับ)</mat-label>
        <textarea matInput rows="3" [(ngModel)]="note" maxlength="255"
                  placeholder="เช่น แจ้งทีมหน้างานไปตรวจสอบแล้ว"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>ยกเลิก</button>
      <button mat-flat-button [mat-dialog-close]="{ note }">รับทราบ</button>
    </mat-dialog-actions>
  `,
})
export class AckDialogComponent {
  alert = inject<Alert>(MAT_DIALOG_DATA);
  note = '';
}
