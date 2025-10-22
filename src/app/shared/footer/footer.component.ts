import { DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { environment } from '@env/environment';
import packageJson from 'package.json';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  imports: [DatePipe, MatButtonModule, RouterLink, MatTooltipModule],
})
export class FooterComponent {
  currentYear = signal<string>(new Date().getFullYear().toString());
  version = signal<string>(packageJson.version);
  buildDate = signal<Date>(environment.buildDate);
  production = signal<boolean>(environment.production);
  emulators = signal<boolean>(environment.useEmulators);
}
