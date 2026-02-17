import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AmountDue } from '@models/amount-due';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';

@Component({
  selector: 'app-settle-group-dialog',
  imports: [MatDialogModule, MatButtonModule, CurrencyPipe],
  templateUrl: './settle-group-dialog.component.html',
})
export class SettleGroupDialogComponent {
  protected readonly data: { transfers: AmountDue[] } = inject(MAT_DIALOG_DATA);
}
