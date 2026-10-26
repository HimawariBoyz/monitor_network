import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, EMPTY, merge, switchMap, timer } from 'rxjs';

export const POLL_MS = 5000;

/**
 * Calls `load` now and every POLL_MS (the roadmap's "polling first" realtime approach).
 * Returns a function that forces an immediate refresh.
 */
export function poll<T>(load: () => Observable<T>, next: (value: T) => void, ms = POLL_MS): () => void {
  const destroyRef = inject(DestroyRef);
  const kick = new Subject<void>();
  merge(timer(0, ms), kick)
    .pipe(
      switchMap(() => load().pipe(catchError(() => EMPTY))),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe(next);
  return () => kick.next();
}
