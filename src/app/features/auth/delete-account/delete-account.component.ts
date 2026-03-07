
import { Component, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { Router, RouterLink } from '@angular/router';
import { GroupService } from '@services/group.service';
import { UserService } from '@services/user.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
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
    RouterLink
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
        data: { message: 'Please confirm that you understand this action is irreversible' },
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
          component: this.constructor.name,
        });
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: `Failed to delete account: ${error.message}` },
      });

      this.analytics.logEvent('error', {
        component: this.constructor.name,
        action: 'delete_account',
        message: error.message,
      });
    } finally {
      this.loading.loadingOff();
    }
  }
}
