import { Component, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

type DeletionState = 'unverified' | 'verified' | 'completed';

@Component({
  selector: 'app-delete-account',
  imports: [
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
export class DeleteAccountComponent {
  protected readonly auth = inject(getAuth);
  protected readonly router = inject(Router);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly functions = inject(getFunctions);
  protected readonly userService = inject(UserService);
  protected readonly groupService = inject(GroupService);

  state = signal<DeletionState>(
    this.auth.currentUser ? 'verified' : 'unverified'
  );
  verifiedEmail = signal<string>(this.auth.currentUser?.email || '');
  confirmDeletion = model<boolean>(false);

  async deleteAccount(): Promise<void> {
    if (!this.confirmDeletion()) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            'Please confirm that you understand this action is irreversible',
        },
      });
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
          await this.userService.logout(false);
        }

        this.state.set('completed');

        this.analytics.logEvent('account_deleted', {
          component: 'DeleteAccountComponent',
        });
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: `Failed to delete account: ${error.message}` },
      });

      this.analytics.logError(
        'Delete Account Component',
        'delete_account',
        'Failed to delete account',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      this.loading.loadingOff();
    }
  }
}
