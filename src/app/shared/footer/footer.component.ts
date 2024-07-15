import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';
import packageJson from 'package.json';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  standalone: true,
  imports: [DatePipe, MatTooltip],
})
export class FooterComponent {
  currentYear: string = new Date().getFullYear().toString();
  version: string = packageJson.version;
  buildDate: Date = environment.buildDate;
}
