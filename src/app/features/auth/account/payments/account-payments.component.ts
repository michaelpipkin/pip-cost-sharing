import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { PaymentsForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-account-payments',
  templateUrl: './account-payments.component.html',
  styleUrls: ['./account-payments.component.scss'],
  imports: [FormField, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPaymentsComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  currentUser = this.userStore.user;

  protected readonly paymentsModel = signal<PaymentsForm>({
    venmoId: this.currentUser()?.venmoId ?? '',
    paypalId: this.currentUser()?.paypalId ?? '',
    cashAppId: this.currentUser()?.cashAppId ?? '',
    zelleId: this.currentUser()?.zelleId ?? '',
  });
  protected readonly paymentsForm = form(this.paymentsModel, () => {});

  constructor() {
    effect(() => {
      this.paymentsModel.set({
        venmoId: this.currentUser()?.venmoId ?? '',
        paypalId: this.currentUser()?.paypalId ?? '',
        cashAppId: this.currentUser()?.cashAppId ?? '',
        zelleId: this.currentUser()?.zelleId ?? '',
      });
    });
  }

  async onSubmitPayments(): Promise<void> {
    const f = this.paymentsForm().value();
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({
        venmoId: f.venmoId,
        paypalId: f.paypalId,
        cashAppId: f.cashAppId,
        zelleId: f.zelleId,
      });
      this.paymentsForm().reset();
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Payment service IDs updated' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Account Payments Component',
          'update_payments',
          error.message
        );
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
