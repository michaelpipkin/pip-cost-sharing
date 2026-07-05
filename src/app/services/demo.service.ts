import { computed, inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { DemoModeService } from './demo-mode.service';

@Injectable({
  providedIn: 'root',
})
export class DemoService {
  protected readonly router = inject(Router);
  protected readonly demoModeService = inject(DemoModeService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly expenseStore = inject(ExpenseStore);

  // Single source of truth: demo state lives on UserStore so it can never
  // desync from the state login/logout already reset (UserStore.initUser
  // always sets isDemoMode: false for a real, authenticated user).
  isInDemoMode = computed(() => this.userStore.isDemoMode());
  private demoDataInitialized = false;

  enterDemoMode(): void {
    if (!this.isInDemoMode()) {
      if (!this.demoDataInitialized) {
        this.demoModeService.initializeDemoData();
        this.demoDataInitialized = true;
      }
    }
  }

  exitDemoMode(): void {
    if (this.isInDemoMode()) {
      this.clearDemoData();
    }
  }

  private clearDemoData(): void {
    this.userStore.clearUser();
    this.userStore.setIsDemoMode(false);
    this.groupStore.clearCurrentGroup();
    this.groupStore.setAllUserGroups([]);
    this.memberStore.setGroupMembers([]);
    this.memberStore.clearCurrentMember();
    this.categoryStore.clearGroupCategories();
    this.expenseStore.clearGroupExpenses();
    this.demoDataInitialized = false;
    localStorage.removeItem('currentGroup');
  }

  showDemoModeRestrictionMessage(): void {
    this.snackbar.openFromComponent(CustomSnackbarComponent, {
      data: { message: 'Data modification is disabled in demo mode' },
    });
  }

  navigateToDemo(path: string): void {
    this.router.navigate(['/demo', path]);
  }

  navigateToDemoRoute(route: string): void {
    this.router.navigateByUrl(route);
  }
}
