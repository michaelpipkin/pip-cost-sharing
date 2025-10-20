import { CommonModule } from '@angular/common';
import { Component, inject, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getAuth, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

type DeletionState = 'unverified' | 'verified' | 'completed';

@Component({
  selector: 'app-delete-account',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    RouterLink,
  ],
  templateUrl: './delete-account.component.html',
  styleUrl: './delete-account.component.scss',
})
export class DeleteAccountComponent implements OnInit {
  protected readonly auth = inject(getAuth);
  protected readonly router = inject(Router);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly loading = inject(LoadingService);
  protected readonly functions = inject(getFunctions);
  protected readonly userService = inject(UserService);
  protected readonly groupService = inject(GroupService);

  state = signal<DeletionState>('unverified');
  verifiedEmail = signal<string>('');
  confirmDeletion = model<boolean>(false);

  ngOnInit(): void {
    // Check if user is logged in
    if (this.auth.currentUser) {
      this.state.set('verified');
      this.verifiedEmail.set(this.auth.currentUser.email || '');
    }
    // If not logged in, stay in 'unverified' state which prompts them to log in
  }

  async deleteAccount(): Promise<void> {
    if (!this.confirmDeletion()) {
      this.snackBar.open(
        'Please confirm that you understand this action is irreversible',
        'Close',
        { verticalPosition: 'top' }
      );
      return;
    }

    this.loading.loadingOn();

    try {
      const deleteAccountFn = httpsCallable(
        this.functions,
        'deleteUserAccount'
      );

      // Pass empty oobCode since user is authenticated
      const result: any = await deleteAccountFn({
        oobCode: null,
      });

      if (result.data.success) {
        // Log out user
        if (this.auth.currentUser) {
          this.userService.logout();
          this.groupService.logout();
          await signOut(this.auth);
        }

        this.state.set('completed');

        logEvent(this.analytics, 'account_deleted', {
          component: this.constructor.name,
        });
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      this.snackBar.open(
        `Failed to delete account: ${error.message}`,
        'Close',
        { duration: 0, verticalPosition: 'top' }
      );

      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'delete_account',
        message: error.message,
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
