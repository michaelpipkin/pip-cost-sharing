import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { environment } from '@env/environment';
import { PwaDetectionService } from '@services/pwa-detection.service';
import packageJson from 'package.json';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  imports: [MatButtonModule, RouterLink, MatTooltipModule],
})
export class FooterComponent {
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly pwaDetection = inject(PwaDetectionService);

  currentYear = signal<string>(new Date().getFullYear().toString());
  version = signal<string>(packageJson.version);
  buildDate = signal<Date>(environment.buildDate);
  production = signal<boolean>(environment.production);
  emulators = signal<boolean>(environment.useEmulators);
  versionText = signal<string>('');

  constructor() {
    // Observe breakpoint changes for responsive version text display
    this.breakpointObserver
      .observe(['(max-width: 420px)'])
      .subscribe((result) => {
        if (result.breakpoints['(max-width: 420px)']) {
          this.versionText.set('');
        } else {
          this.versionText.set(`${this.version()} | `);
        }
      });
  }
  async openPrivacyPolicy(event: Event) {
    if (this.pwaDetection.isRunningAsApp()) {
      event.preventDefault();
      await Browser.open({ url: 'https://pipsplit.com/privacy-policy.html' });
    }
  }
}
