import { Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-account-legal',
  templateUrl: './account-legal.component.html',
  styleUrls: ['./account-legal.component.scss'],
  imports: [FormsModule, MatCheckboxModule, MatButtonModule, MatIconModule],
})
export class AccountLegalComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  user = this.userStore.user;
  receiptPolicyAcknowledged = model<boolean>(false);

  async acceptReceiptPolicy(): Promise<void> {
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({ receiptPolicy: true });
      this.receiptPolicyAcknowledged.set(false);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Receipt retention policy accepted' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Account Legal Component',
          'accept_receipt_policy',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message: 'Something went wrong - could not accept receipt policy',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
