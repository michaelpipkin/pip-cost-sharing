import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

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

  protected readonly data: paymentData = inject(MAT_DIALOG_DATA);

  copyPaymentIdToClipboard(paymentId: string): void {
    navigator.clipboard
      .writeText(paymentId)
      .then(() => {
        this.snackBar.open('Payment ID copied:', 'OK', {
          duration: 2000,
        });
      })
      .catch((err) => {
        this.snackBar.open(`Failed to copy payment ID: ${err}`, 'OK', {
          duration: 2000,
        });
      });
  }
}

type paymentData = {
  payToMemberName: string;
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
};
