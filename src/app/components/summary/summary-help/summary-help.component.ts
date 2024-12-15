import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-summary-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './summary-help.component.html',
  styleUrl: './summary-help.component.scss',
})
export class SummaryHelpComponent {}
