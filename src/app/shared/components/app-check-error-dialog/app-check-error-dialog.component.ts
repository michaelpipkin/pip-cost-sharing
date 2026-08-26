import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';

@Component({
  selector: 'app-app-check-error-dialog',
  templateUrl: './app-check-error-dialog.component.html',
  styleUrl: './app-check-error-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppCheckErrorDialogComponent {
  protected readonly dialogRef = inject(
    MatDialogRef<AppCheckErrorDialogComponent>
  );
  protected readonly router = inject(Router);

  // The Help page's Report an Issue form only exists on that page - unlike
  // the general help-content dialog (HelpDialogComponent), this dialog can
  // pop up from anywhere in the app, so it navigates there instead of
  // claiming a form is "below" that isn't actually present here.
  goToHelp(): void {
    this.dialogRef.close();
    this.router.navigateByUrl(ROUTE_PATHS.HELP);
  }
}
