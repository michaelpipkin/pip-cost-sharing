import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { UpdatePromptDialogComponent } from '@components/update-prompt-dialog/update-prompt-dialog.component';
import { AnalyticsService } from '@services/analytics.service';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.pipsplit.app';

// Native Android builds (versionCode in android/app/build.gradle) below this
// are asked to update. 24 = the first build with Play Integrity for App
// Check; older builds keep hitting reCAPTCHA throttling. The Android shell
// loads the live web bundle, so changing this is a normal web deploy - no
// native release needed.
export const MIN_NATIVE_BUILD = 24;

@Injectable({
  providedIn: 'root',
})
export class AppUpdatePromptService {
  protected readonly dialog = inject(MatDialog);
  protected readonly analytics = inject(AnalyticsService);

  #promptedThisSession = false;

  // Gentle, dismissible nudge for outdated native builds: at most once per
  // app session, silent everywhere it doesn't apply (web, iOS, builds
  // without the @capacitor/app plugin, or a failed version lookup).
  async checkOnStartup(): Promise<void> {
    if (this.#promptedThisSession) return;
    if (
      Capacitor.getPlatform() !== 'android' ||
      !Capacitor.isPluginAvailable('App')
    ) {
      return;
    }

    let build: number;
    try {
      build = Number.parseInt((await App.getInfo()).build, 10);
    } catch {
      return;
    }
    if (Number.isNaN(build) || build >= MIN_NATIVE_BUILD) return;

    this.#promptedThisSession = true;
    this.showPrompt(false, build);
  }

  // `preview` is for the owner-only test button on the My Account page:
  // shows exactly what an outdated build sees, regardless of this build's
  // own version.
  showPrompt(preview = true, build?: number): void {
    // preview is a string: Analytics event parameters are strings/numbers,
    // and booleans aren't reliably carried through the native plugin.
    this.analytics.logEvent('update_prompt_shown', {
      preview: String(preview),
      ...(build === undefined ? {} : { native_build: build }),
    });
    this.dialog
      .open(UpdatePromptDialogComponent, { disableClose: false })
      .afterClosed()
      .subscribe((update) => {
        if (update === true) {
          this.analytics.logEvent('update_prompt_accepted', {
            preview: String(preview),
          });
          void this.openStoreListing();
        }
      });
  }

  async openStoreListing(): Promise<void> {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Browser')) {
      await Browser.open({ url: PLAY_STORE_URL });
    } else {
      globalThis.open(PLAY_STORE_URL, '_blank');
    }
  }
}
