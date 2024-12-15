import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-expenses-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './expenses-help.component.html',
  styleUrl: './expenses-help.component.scss',
})
export class ExpensesHelpComponent {}
