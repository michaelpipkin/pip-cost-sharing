import { Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-account-payments',
  templateUrl: './account-payments.component.html',
  styleUrls: ['./account-payments.component.scss'],
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
})
export class AccountPaymentsComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  currentUser = this.userStore.user;

  paymentsForm = this.fb.group({
    venmoId: [this.currentUser()?.venmoId],
    paypalId: [this.currentUser()?.paypalId],
    cashAppId: [this.currentUser()?.cashAppId],
    zelleId: [this.currentUser()?.zelleId],
  });

  constructor() {
    effect(() => {
      this.paymentsForm.patchValue({
        venmoId: this.currentUser()?.venmoId,
        paypalId: this.currentUser()?.paypalId,
        cashAppId: this.currentUser()?.cashAppId,
        zelleId: this.currentUser()?.zelleId,
      });
    });
  }

  get p() {
    return this.paymentsForm.controls;
  }

  async onSubmitPayments(): Promise<void> {
    const changes = this.paymentsForm.value;
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({
        venmoId: changes.venmoId ?? undefined,
        paypalId: changes.paypalId ?? undefined,
        cashAppId: changes.cashAppId ?? undefined,
        zelleId: changes.zelleId ?? undefined,
      });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Payment service IDs updated' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('app_error', {
          component: 'AccountPaymentsComponent',
          action: 'update_payments',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message:
              'Something went wrong - could not update payment service IDs',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
