import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getAnalytics, logEvent } from 'firebase/analytics';

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
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);

  protected readonly data: paymentData = inject(MAT_DIALOG_DATA);

  async copyPaymentIdToClipboard(paymentId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(paymentId);
      this.snackBar.open('Payment ID copied to clipboard', 'OK', {
        duration: 2000,
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'copy_payment_id_to_clipboard',
          message: error.message,
        });
      } else {
        this.snackBar.open('Failed to copy payment ID', 'OK', {
          duration: 2000,
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
