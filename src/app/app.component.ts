import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, effect, inject, Signal } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatIcon } from '@angular/material/icon';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Group } from '@models/group';
import { User } from '@models/user';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
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
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expensesService = inject(ExpenseService);
  router = inject(Router);
  analytics = inject(Analytics);

  user: Signal<User> = this.userService.user;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  isLoggedIn: Signal<boolean> = this.userService.isLoggedIn;

  constructor() {
    logEvent(this.analytics, 'app_initalized');
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
