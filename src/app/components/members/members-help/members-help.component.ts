import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-members-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './members-help.component.html',
  styleUrl: './members-help.component.scss',
})
export class MembersHelpComponent {}
