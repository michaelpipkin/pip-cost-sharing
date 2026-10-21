import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { Browser } from '@capacitor/browser';
import { environment } from '@env/environment';
import { MediaQueryService } from '@services/media-query.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import packageJson from 'package.json';

@Component({
  selector: 'footer',
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  imports: [MatButtonModule, RouterLink, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  protected readonly mediaQuery = inject(MediaQueryService);
  protected readonly pwaDetection = inject(PwaDetectionService);

  currentYear = signal<string>(new Date().getFullYear().toString());
  version = signal<string>(packageJson.version);
  buildDate = signal<Date>(environment.buildDate);
  production = signal<boolean>(environment.production);
  emulators = signal<boolean>(environment.useEmulators);
  readonly #narrow = this.mediaQuery.matches('(max-width: 420px)');
  // The version is dropped from the footer on very narrow screens.
  versionText = computed(() => (this.#narrow() ? '' : `${this.version()} | `));

  async openPrivacyPolicy(event: Event) {
    if (this.pwaDetection.isRunningAsApp()) {
      event.preventDefault();
      await Browser.open({ url: 'https://pipsplit.com/privacy-policy.html' });
    }
  }
}
