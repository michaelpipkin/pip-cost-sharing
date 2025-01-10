import { DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import packageJson from 'package.json';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  imports: [DatePipe],
})
export class FooterComponent {
  currentYear = signal<string>(new Date().getFullYear().toString());
  version = signal<string>(packageJson.version);
  buildDate = signal<Date>(environment.buildDate);
  production = signal<boolean>(environment.production);
  emulators = signal<boolean>(environment.useEmulators);
}
