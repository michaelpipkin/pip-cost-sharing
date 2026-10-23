import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TextZoom } from '@capacitor/text-zoom';
import { FooterComponent } from '@components/footer/footer.component';
import { LoadingComponent } from '@components/loading/loading.component';
import { NavigationLoadingService } from '@components/loading/navigation-loading.service';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Group } from '@models/group';
import { User } from '@models/user';
import { AdMobService } from '@services/admob.service';
import { AdSenseService } from '@services/adsense.service';
import { AnalyticsService } from '@services/analytics.service';
import { AppUpdatePromptService } from '@services/app-update-prompt.service';
import { DeepLinkService } from '@services/deep-link.service';
import { MediaQueryService } from '@services/media-query.service';
import { MemberService } from '@services/member.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { ThemeService } from '@services/theme.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { GroupEmailPrompt, UserStore } from '@store/user.store';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    MatButtonModule,
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatToolbarModule,
    MatMenuModule,
    LoadingComponent,
    RouterOutlet,
    FooterComponent,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  title = 'PipSplit';

  protected readonly themeService = inject(ThemeService);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly router = inject(Router);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly mediaQuery = inject(MediaQueryService);
  protected readonly pwaDetection = inject(PwaDetectionService);
  protected readonly adMobService = inject(AdMobService);
  protected readonly adSenseService = inject(AdSenseService);
  protected readonly deepLinkService = inject(DeepLinkService);
  protected readonly appUpdatePrompt = inject(AppUpdatePromptService);
  protected readonly navigationLoading = inject(NavigationLoadingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly memberService = inject(MemberService);

  readonly isSmallScreen = this.mediaQuery.matches('(max-width: 1115px)');

  user: Signal<User | null> = this.userStore.user;
  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
  isValidUser: Signal<boolean> = this.userStore.isValidUser;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;

  // Route constants for template access
  readonly routes = ROUTE_PATHS;

  constructor() {
    afterNextRender(async () => {
      await this.analytics.logEvent('app_initalized');
      await this.lockTextZoom();
      this.deepLinkService.initialize();
      await this.appUpdatePrompt.checkOnStartup();
    });

    // A login-email change was just written to the profile (UserService):
    // offer to move the group member emails too. The offer waits for a
    // signed-in, validated user (a confirmed change often ends the session,
    // and the user signs back in), and is made once per change.
    effect(() => {
      const prompt = this.userStore.groupEmailPrompt();
      const user = this.userStore.user();
      if (!prompt || !user || !this.isValidUser()) return;
      untracked(() => void this.#offerGroupEmailUpdate(prompt, user));
    });
  }

  async #offerGroupEmailUpdate(
    prompt: GroupEmailPrompt,
    user: User
  ): Promise<void> {
    // Shown once per change, whatever happens next.
    this.userStore.setGroupEmailPrompt(null);
    // A change made under another account (a stale prompt) is not this
    // user's to act on.
    if (user.id !== prompt.uid || !user.ref) return;

    try {
      const emails = await this.memberService.getLinkedMemberEmails(user.ref);
      const newEmail = prompt.newEmail.toLowerCase();
      const oldEmail = prompt.oldEmail.toLowerCase();
      const differing = emails.filter((e) => e.toLowerCase() !== newEmail);
      // Nothing to offer: every membership already uses the new address.
      if (differing.length === 0) return;
      // Needed only right after a login-email change, so keep it out of the
      // main bundle.
      const { GroupEmailUpdateDialogComponent } = await import(
        '@features/auth/group-email-update-dialog/group-email-update-dialog.component'
      );
      this.dialog.open(GroupEmailUpdateDialogComponent, {
        data: {
          oldEmail: prompt.oldEmail,
          newEmail: prompt.newEmail,
          total: differing.length,
          onOldEmail: differing.filter((e) => e.toLowerCase() === oldEmail)
            .length,
          // No address at all is neither "old" nor a deliberate choice.
          blank: differing.filter((e) => e.trim() === '').length,
        },
      });
    } catch {
      // MemberService has logged it; the Profile page's Sync still works.
    }
  }

  private async lockTextZoom() {
    if (this.pwaDetection.isRunningAsApp()) {
      // Set zoom to 100% (1) regardless of system setting
      await TextZoom.set({ value: 1 });
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  logout(): void {
    this.userService.logout();
  }
}
