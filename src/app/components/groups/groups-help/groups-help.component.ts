import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-groups-help',
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './groups-help.component.html',
  styleUrl: './groups-help.component.scss',
})
export class GroupsHelpComponent {}
