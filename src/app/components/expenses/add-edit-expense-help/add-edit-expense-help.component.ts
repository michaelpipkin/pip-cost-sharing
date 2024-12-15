import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-add-edit-expense-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './add-edit-expense-help.component.html',
  styleUrl: './add-edit-expense-help.component.scss',
})
export class AddEditExpenseHelpComponent {}
