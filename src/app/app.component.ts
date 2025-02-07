import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, OnInit, signal, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
import { User } from '@models/user';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';

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
export class AppComponent implements OnInit {
  title = 'Cost Sharing';

  userStore = inject(UserStore);
  userService = inject(UserService);
  groupStore = inject(GroupStore);
  router = inject(Router);
  analytics = inject(getAnalytics);
  breakpointObserver = inject(BreakpointObserver);

  isSmallScreen = signal<boolean>(false);

  user: Signal<User> = this.userStore.user;
  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;

  constructor() {
    logEvent(this.analytics, 'app_initalized');
  }

  ngOnInit(): void {
    this.breakpointObserver
      .observe('(max-width: 1009px)')
      .subscribe((result) => {
        this.isSmallScreen.set(result.matches);
      });
  }

  logout(): void {
    this.userService.logout();
  }
}
