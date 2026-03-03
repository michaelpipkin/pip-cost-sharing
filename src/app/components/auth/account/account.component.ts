import {
  Component,
  computed,
  effect,
  inject,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { APP_OWNER_EMAIL } from '@components/auth/guards.guard';
import { UserStore } from '@store/user.store';
import { User as FirebaseUser, getAuth } from 'firebase/auth';

@Component({
  selector: 'app-account',
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  imports: [
    MatListModule,
    MatButtonModule,
    MatIconModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
})
export class AccountComponent {
  protected readonly auth = inject(getAuth);
  protected readonly userStore = inject(UserStore);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  isGoogleUser: Signal<boolean> = this.userStore.isGoogleUser;
  isEmailConfirmed: Signal<boolean> = this.userStore.isEmailConfirmed;

  firebaseUser = signal<FirebaseUser | null>(this.auth.currentUser);
  isAdmin = computed(() => this.firebaseUser()?.email === APP_OWNER_EMAIL);

  isMobile = signal(false);
  isChildActive = signal(
    !this.router.url.match(/^\/auth\/account\/?$/)
  );

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 767px)')
      .subscribe((result) => {
        this.isMobile.set(result.matches);
      });

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.isChildActive.set(!event.url.match(/^\/auth\/account\/?$/));
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
