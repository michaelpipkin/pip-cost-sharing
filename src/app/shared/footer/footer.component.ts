import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, OnInit, signal } from '@angular/core';
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
export class FooterComponent implements OnInit {
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly pwaDetection = inject(PwaDetectionService);

  currentYear = signal<string>(new Date().getFullYear().toString());
  version = signal<string>(packageJson.version);
  buildDate = signal<Date>(environment.buildDate);
  production = signal<boolean>(environment.production);
  emulators = signal<boolean>(environment.useEmulators);
  versionText = signal<string>('');

  ngOnInit(): void {
    this.breakpointObserver
      .observe([
        '(max-width: 499px)',
        '(min-width: 500px) and (max-width: 599px)',
        '(min-width: 600px)',
      ])
      .subscribe((result) => {
        const date = new Date(this.buildDate());
        const buildDateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        if (result.breakpoints['(max-width: 499px)']) {
          // Under 500px: v{version}
          this.versionText.set(`v${this.version()}`);
        } else if (
          result.breakpoints['(min-width: 500px) and (max-width: 599px)']
        ) {
          // 500-599px: v{version} | {build date}
          this.versionText.set(`v${this.version()} | ${buildDateString}`);
        } else {
          // 600px+: Version {version} | Build Date: {build date}
          this.versionText.set(
            `Version ${this.version()} | Build Date: ${buildDateString}`
          );
        }
      });
  }

  async openPrivacyPolicy(event: Event) {
    if (this.pwaDetection.isRunningAsApp()) {
      event.preventDefault();
      await Browser.open({ url: 'https://pipsplit.com/privacy-policy.html' });
    }
    // If running in browser, let the default behavior handle it (target="_blank")
  }
}
