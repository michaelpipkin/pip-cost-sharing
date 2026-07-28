import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type AddExpenseOption = 'manual' | 'receipt' | 'rental';

@Component({
  selector: 'app-add-expense-options-dialog',
  templateUrl: './add-expense-options-dialog.component.html',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddExpenseOptionsDialogComponent {}
