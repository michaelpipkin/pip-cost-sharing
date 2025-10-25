import { BreakpointObserver } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { DEMO_ROUTE_PATHS, ROUTE_PATHS } from '@constants/routes.constants';
import { Group } from '@models/group';
import { User } from '@models/user';
import { TranslateService } from '@ngx-translate/core';
import { DemoService } from '@services/demo.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { AccountMenuComponent } from './shared/account-menu/account-menu.component';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';
import {
  Component,
  effect,
  inject,
  OnInit,
  signal,
  Signal,
} from '@angular/core';

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
    AccountMenuComponent,
  ],
})
export class AppComponent implements OnInit {
  title = 'Cost Sharing';

  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly demoService = inject(DemoService);
  protected readonly router = inject(Router);
  protected readonly analytics = inject(getAnalytics);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly translate = inject(TranslateService);

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

    // Initialize translation service
    this.translate.setFallbackLang('en');
    this.translate.use('en');

    // Set user's preferred language when user loads
    effect(() => {
      const user = this.user();
      if (user?.language) {
        this.translate.use(user.language);
      }
    });
  }

  ngOnInit(): void {
    this.breakpointObserver
      .observe('(max-width: 1100px)')
      .subscribe((result) => {
        this.isSmallScreen.set(result.matches);
      });
  }

  logout(): void {
    this.userService.logout();
  }
}
