import { Component } from '@angular/core';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  currentYear: string;

  constructor() {
    this.currentYear = new Date().getFullYear().toString();
  }
}
