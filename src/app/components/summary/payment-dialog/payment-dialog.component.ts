import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-payment-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './payment-dialog.component.html',
  styleUrl: './payment-dialog.component.scss',
})
export class PaymentDialogComponent {
  protected readonly data: paymentData = inject(MAT_DIALOG_DATA);
}

type paymentData = {
  payToMemberName: string;
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
};
