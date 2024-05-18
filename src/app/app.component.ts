import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject, WritableSignal } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
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
  analytics = inject(AngularFireAnalytics);

  currentGroup: WritableSignal<Group> = this.groupService.currentGroup;

  constructor() {
    this.analytics.logEvent('app_initalized');
  }

  logout(): void {
    this.userService.logout();
  }
}
