import { Component } from '@angular/core';
import packageJson from '../../../../package.json';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  currentYear: string = new Date().getFullYear().toString();
  version: string = packageJson.version;
}
