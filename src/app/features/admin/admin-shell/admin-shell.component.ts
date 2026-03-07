import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  templateUrl: './admin-shell.component.html',
  imports: [MatTabsModule, RouterLink, RouterLinkActive, RouterOutlet],
})
export class AdminShellComponent {}
