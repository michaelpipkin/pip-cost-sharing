import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { APP_OWNER_EMAIL } from '@features/auth/guards.guard';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { User as FirebaseUser, getAuth } from 'firebase/auth';

@Component({
  selector: 'app-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  imports: [
    MatListModule,
    MatIconModule,
    RouterLink,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  protected readonly auth = inject(getAuth);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  isLoggedIn: Signal<boolean> = this.userStore.isLoggedIn;
  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;
  isEmailConfirmed: Signal<boolean> = this.userStore.isEmailConfirmed;
  // Only show the Group Membership nav item when the user has at least one
  // group to rejoin - most users never leave a group and shouldn't see an
  // empty page in the sidebar.
  hasLeftGroups = computed(
    () => this.groupStore.leftUserGroups().length > 0
  );

  firebaseUser = signal<FirebaseUser | null>(this.auth.currentUser);
  isAdmin = computed(() => this.firebaseUser()?.email === APP_OWNER_EMAIL);

  isMobile = signal(false);
  isChildActive = signal(!/^\/auth\/account\/?$/.test(this.router.url));
  currentUrl = signal(this.router.url);

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 767px)')
      .subscribe((result) => {
        this.isMobile.set(result.matches);
      });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.isChildActive.set(!/^\/auth\/account\/?$/.test(event.url));
        this.currentUrl.set(event.url);
      }
    });

    effect(() => {
      if (!this.isMobile() && !this.isChildActive()) {
        untracked(() => {
          this.router.navigate(['profile'], { relativeTo: this.route });
        });
      }
    });
  }

  navigateToList(): void {
    this.router.navigate(['/auth/account']);
  }
}
