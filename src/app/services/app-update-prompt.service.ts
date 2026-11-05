import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  UpdatePromptDialogComponent,
  UpdatePromptDialogData,
} from '@components/update-prompt-dialog/update-prompt-dialog.component';
import { AnalyticsService } from '@services/analytics.service';

// Native Android builds (versionCode in android/app/build.gradle) below this
// must update. 26 = 1.3.1, the first build with Play Integrity for App Check
// and no known release-only bugs; older builds use reCAPTCHA inside the
// WebView, which would lock them out once Firestore enforces App Check. The
// Android shell loads the live web bundle, so changing this is a normal web
// deploy - no native release needed. Raise it only once the new build has
// reached 100% in Play: the prompt can't be dismissed, so a build Play won't
// offer yet would strand the user.
export const MIN_NATIVE_BUILD = 26;

@Injectable({
  providedIn: 'root',
})
export class AppUpdatePromptService {
  protected readonly dialog = inject(MatDialog);
  protected readonly analytics = inject(AnalyticsService);

  #promptedThisSession = false;

  // Blocks outdated native builds with a prompt that can't be dismissed.
  // Silent everywhere it doesn't apply (web, iOS), and deliberately fails open
  // when the version can't be read (no @capacitor/app plugin, a failed or
  // unparseable lookup): a blocking prompt must never hit a current build.
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
    this.analytics.logEvent('update_prompt_shown', { native_build: build });
    this.dialog.open<UpdatePromptDialogComponent, UpdatePromptDialogData>(
      UpdatePromptDialogComponent,
      {
        disableClose: true,
        // The Android back button is a history navigation, which would
        // otherwise close the dialog.
        closeOnNavigation: false,
        data: { nativeBuild: build },
      }
    );
  }
}
