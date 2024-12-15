import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-history-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './history-help.component.html',
  styleUrl: './history-help.component.scss',
})
export class HistoryHelpComponent {}
