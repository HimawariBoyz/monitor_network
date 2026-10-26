import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../core/api.service';
import { Alert } from '../core/models';
import { AckDialogComponent } from './ack-dialog.component';

/** Returns a function that opens the acknowledge dialog and calls the API. */
export function injectAcknowledge(): (alert: Alert, done: () => void) => void {
  const dialog = inject(MatDialog);
  const api = inject(ApiService);
  const snack = inject(MatSnackBar);
  return (alert, done) =>
    dialog
      .open(AckDialogComponent, { data: alert, width: '480px' })
      .afterClosed()
      .subscribe((result?: { note: string }) => {
        if (!result) return;
        api.acknowledge(alert.id, result.note).subscribe({
          next: () => {
            snack.open('รับทราบ Alert แล้ว', 'ปิด', { duration: 3000 });
            done();
          },
          error: (e) => snack.open(e.error?.detail ?? 'รับทราบไม่สำเร็จ', 'ปิด', { duration: 4000 }),
        });
      });
}
