import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { AnalyticsService } from '@services/analytics.service';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.pipsplit.app';
export const WEB_APP_URL = 'https://pipsplit.com';

export type UpdatePromptDialogData = { nativeBuild: number };

// Shown to outdated native builds and never closes (see
// AppUpdatePromptService): if the user comes back from the Play Store without
// updating, they are still blocked. The web link is the way out for phones
// that can't install the update.
@Component({
  selector: 'app-update-prompt-dialog',
  templateUrl: './update-prompt-dialog.component.html',
  styleUrl: './update-prompt-dialog.component.scss',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdatePromptDialogComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly data = inject<UpdatePromptDialogData>(MAT_DIALOG_DATA);

  protected readonly webAppUrl = WEB_APP_URL;

  async openStoreListing(): Promise<void> {
    this.analytics.logEvent('update_prompt_accepted', {
      native_build: this.data.nativeBuild,
    });
    await this.#openExternally(PLAY_STORE_URL);
  }

  async openWebApp(event: Event): Promise<void> {
    event.preventDefault();
    this.analytics.logEvent('update_prompt_web_chosen', {
      native_build: this.data.nativeBuild,
    });
    await this.#openExternally(WEB_APP_URL);
  }

  async #openExternally(url: string): Promise<void> {
    if (Capacitor.isPluginAvailable('Browser')) {
      await Browser.open({ url });
    } else {
      globalThis.open(url, '_blank');
    }
  }
}
