import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-categories-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './categories-help.component.html',
  styleUrl: './categories-help.component.scss',
})
export class CategoriesHelpComponent {}
