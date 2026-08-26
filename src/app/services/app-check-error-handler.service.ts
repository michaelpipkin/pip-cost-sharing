import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { isLikelyAppCheckError } from '@utils/app-check-error.util';

@Injectable({
  providedIn: 'root',
})
export class AppCheckErrorHandlerService {
  protected readonly dialog = inject(MatDialog);
  protected readonly snackbar = inject(MatSnackBar);

  // A snackbar disappears in a few seconds and gives a throttled user no
  // way to act - they just see "something went wrong" with no idea what
  // to try next. When `error` looks App Check-caused, show a dedicated,
  // concise dialog instead (AppCheckErrorDialogComponent) - deliberately
  // NOT the general help-content dialog/'cant-verify-device' section:
  // that text is written for the Help page itself (references a Report
  // an Issue form that's only actually present there) and is longer than
  // needed for a popup that can appear from anywhere in the app. Anything
  // else falls back to the plain snackbar callers used before this
  // existed.
  handle(error: unknown, fallbackMessage: string): void {
    if (isLikelyAppCheckError(error)) {
      this.dialog.open(AppCheckErrorDialogComponent, {
        disableClose: false,
        maxWidth: '80vw',
      });
      return;
    }
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: fallbackMessage },
    });
  }
}
