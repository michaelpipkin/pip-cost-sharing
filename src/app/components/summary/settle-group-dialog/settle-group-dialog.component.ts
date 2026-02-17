import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AmountDue } from '@models/amount-due';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { AnalyticsService } from '@services/analytics.service';

@Component({
  selector: 'app-settle-group-dialog',
  imports: [MatDialogModule, MatButtonModule, CurrencyPipe],
  templateUrl: './settle-group-dialog.component.html',
})
export class SettleGroupDialogComponent {
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly data: {
    transfers: AmountDue[];
    settlementText: string;
  } = inject(MAT_DIALOG_DATA);

  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.data.settlementText);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Settlement copied to clipboard' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'copy_settlement_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy settlement' },
        });
      }
    }
  }
}
