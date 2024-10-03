import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, inject, OnInit, signal, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    MatButtonModule,
    RouterLink,
    MatIconModule,
    MatToolbarModule,
    MatMenuModule,
    LoadingComponent,
    RouterOutlet,
    FooterComponent,
  ],
})
export class AppComponent implements OnInit {
  title = 'Cost Sharing';

  userService = inject(UserService);
  groupService = inject(GroupService);
  router = inject(Router);
  analytics = inject(Analytics);
  breakpointObserver = inject(BreakpointObserver);

  isSmallScreen = signal<boolean>(false);

  user: Signal<User> = this.userService.user;
  isLoggedIn: Signal<boolean> = this.userService.isLoggedIn;
  currentGroup: Signal<Group> = this.groupService.currentGroup;

  constructor() {
    logEvent(this.analytics, 'app_initalized');
  }

  ngOnInit(): void {
    this.breakpointObserver
      .observe('(max-width: 964px)')
      .subscribe((result) => {
        this.isSmallScreen.set(result.matches);
      });
  }

  logout(): void {
    this.userService.logout();
  }

  menuClick(navBar: HTMLDivElement, hamburger: HTMLButtonElement): void {
    if (navBar.classList.contains('show')) {
      hamburger.click();
    }
  }
}
