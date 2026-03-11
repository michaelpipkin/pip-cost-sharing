import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { AnalyticsService } from '@services/analytics.service';

@Component({
  selector: 'app-payment-dialog',
  imports: [
    MatFormFieldModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './payment-dialog.component.html',
  styleUrl: './payment-dialog.component.scss',
})
export class PaymentDialogComponent {
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);

  protected readonly data: paymentData = inject(MAT_DIALOG_DATA);

  async copyPaymentIdToClipboard(paymentId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(paymentId);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Payment ID copied to clipboard' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'PaymentDialogComponent',
          'copy_payment_id_to_clipboard',
          'Failed to copy payment ID to clipboard',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Failed to copy payment ID' },
        });
      }
    }
  }
}

type paymentData = {
  payToMemberName: string;
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
};
