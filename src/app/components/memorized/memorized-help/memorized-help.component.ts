import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-memorized-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './memorized-help.component.html',
  styleUrl: './memorized-help.component.scss',
})
export class MemorizedHelpComponent {}
