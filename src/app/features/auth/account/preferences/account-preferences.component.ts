import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Signal,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { Group } from '@models/group';
import { PreferencesForm } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-account-preferences',
  templateUrl: './account-preferences.component.html',
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    DocRefCompareDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPreferencesComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly userService = inject(UserService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  currentUser = this.userStore.user;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  protected readonly groupRef = signal<PreferencesForm['groupRef']>(
    this.currentUser()?.defaultGroupRef ?? null
  );
  protected readonly isDirty = signal(false);

  constructor() {
    effect(() => {
      this.groupRef.set(this.currentUser()?.defaultGroupRef ?? null);
      this.isDirty.set(false);
    });
  }

  async onSubmitGroup(): Promise<void> {
    const groupRef = this.groupRef();
    this.loading.loadingOn();
    try {
      await this.userService.updateUser({ defaultGroupRef: groupRef });
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Default group updated' },
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Account Preferences Component',
          'update_default_group',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message: 'Something went wrong - could not update default group',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
