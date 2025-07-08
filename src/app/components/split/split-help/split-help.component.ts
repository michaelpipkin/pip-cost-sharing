import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-split-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './split-help.component.html',
  styleUrl: './split-help.component.scss',
})
export class SplitHelpComponent {}
