import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
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
    RouterLink,
    CommonModule,
    MatIcon,
    LoadingComponent,
    RouterOutlet,
    FooterComponent,
    AsyncPipe,
  ],
})
export class AppComponent {
  title = 'Cost Sharing';

  userService = inject(UserService);
  groupService = inject(GroupService);
  analytics = inject(Analytics);

  currentGroup: Signal<Group> = this.groupService.currentGroup;
  isLoggedIn: Signal<boolean> = this.userService.isLoggedIn;

  constructor() {
    logEvent(this.analytics, 'app_initalized');
  }

  logout(): void {
    this.userService.logout();
  }
}
