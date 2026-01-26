import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, signal, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TextZoom } from '@capacitor/text-zoom';
import { DEMO_ROUTE_PATHS, ROUTE_PATHS } from '@constants/routes.constants';
import { Group } from '@models/group';
import { User } from '@models/user';
import { AdMobService } from '@services/admob.service';
import { AdSenseService } from '@services/adsense.service';
import { DeepLinkService } from '@services/deep-link.service';
import { DemoService } from '@services/demo.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { ThemeService } from '@services/theme.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';
import { NavigationLoadingService } from './shared/loading/navigation-loading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [
    MatButtonModule,
    RouterLink,
    MatIconModule,
    MatToolbarModule,
    MatMenuModule,
    LoadingComponent,
    RouterOutlet,
    FooterComponent,
    MatTooltipModule,
  ],
})
export class AppComponent {
  title = 'Cost Sharing';

  protected readonly themeService = inject(ThemeService);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly demoService = inject(DemoService);
  protected readonly router = inject(Router);
  protected readonly analytics = inject(getAnalytics);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly pwaDetection = inject(PwaDetectionService);
  private adMobService = inject(AdMobService);
  private adSenseService = inject(AdSenseService);
  private deepLinkService = inject(DeepLinkService);
  private navigationLoading = inject(NavigationLoadingService);

  isSmallScreen = signal<boolean>(false);

  user: Signal<User> = this.userStore.user;
  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
  isValidUser: Signal<boolean> = this.userStore.isValidUser;
  isInDemoMode: Signal<boolean> = this.demoService.isInDemoMode;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;

  // Route constants for template access
  readonly routes = ROUTE_PATHS;
  readonly demoRoutes = DEMO_ROUTE_PATHS;

  constructor() {
    logEvent(this.analytics, 'app_initalized');
    this.lockTextZoom();
    this.deepLinkService.initialize();

    // Observe breakpoint changes for responsive layout
    this.breakpointObserver
      .observe('(max-width: 1100px)')
      .subscribe((result) => {
        this.isSmallScreen.set(result.matches);
      });
  }

  private async lockTextZoom() {
    if (this.pwaDetection.isRunningAsApp()) {
      // Set zoom to 100% (1.0) regardless of system setting
      await TextZoom.set({ value: 1.0 });

      // Status bar is now handled by edge-to-edge configuration in:
      // - MainActivity.java (WindowInsetsControllerCompat)
      // - styles.xml (transparent status bar)
      // - styles.scss (safe area insets)
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  logout(): void {
    this.userService.logout();
  }
}
