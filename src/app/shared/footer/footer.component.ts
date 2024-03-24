import { Component } from '@angular/core';
import packageJson from 'package.json';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  currentYear: string = new Date().getFullYear().toString();
  version: string = packageJson.version;
  buildDate: Date = environment.buildDate;
}
