import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { NavigationEnd, Router } from '@angular/router';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { DemoModeService } from './demo-mode.service';

/**
 * Service to manage demo mode state based on current route
 * Detects when user is viewing demo pages and provides demo-specific functionality
 */
@Injectable({
  providedIn: 'root',
})
export class DemoService implements OnDestroy {
  private readonly router = inject(Router);
  private readonly demoModeService = inject(DemoModeService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly userStore = inject(UserStore);
  private readonly groupStore = inject(GroupStore);
  private readonly memberStore = inject(MemberStore);
  private readonly categoryStore = inject(CategoryStore);
  private readonly expenseStore = inject(ExpenseStore);
  private routerSubscription?: { unsubscribe: () => void };

  // Signal to track if user is currently in demo mode
  isInDemoMode = signal<boolean>(false);
  private demoDataInitialized = false;

  constructor() {
    // Check initial route
    this.updateDemoMode(this.router.url);

    // Watch for route changes
    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateDemoMode(event.url);
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  /**
   * Check if the current URL is a demo route
   */
  private updateDemoMode(url: string): void {
    const isDemoRoute = url.includes('/demo');
    const wasInDemoMode = this.isInDemoMode();
    this.isInDemoMode.set(isDemoRoute);

    // Initialize demo data only when entering demo mode for the first time
    if (isDemoRoute && !this.demoDataInitialized) {
      this.demoModeService.initializeDemoData();
      this.demoDataInitialized = true;
    }

    // Clear demo data when exiting demo mode
    if (!isDemoRoute && wasInDemoMode && this.demoDataInitialized) {
      this.clearDemoData();
    }
  }

  /**
   * Clear demo data from all stores when exiting demo mode
   */
  private clearDemoData(): void {
    this.userStore.setUser(null);
    this.userStore.setIsDemoMode(false);
    this.groupStore.clearCurrentGroup();
    this.groupStore.setAllUserGroups([]);
    this.groupStore.setAdminGroupIds([]);
    this.memberStore.setGroupMembers([]);
    this.memberStore.clearCurrentMember();
    this.categoryStore.clearGroupCategories();
    this.expenseStore.clearGroupExpenses();
    this.demoDataInitialized = false;
  }

  /**
   * Show a snackbar message indicating data modification is disabled in demo mode
   * This should be called whenever a user tries to save/delete/modify data in demo components
   */
  showDemoModeRestrictionMessage(): void {
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: 'Data modification is disabled in demo mode' },
    });
  }

  /**
   * Navigate to the demo version of a specific page
   */
  navigateToDemo(path: string): void {
    this.router.navigate(['/demo', path]);
  }

  /**
   * Navigate to a demo route
   */
  navigateToDemoRoute(route: string): void {
    this.router.navigateByUrl(route);
  }
}
