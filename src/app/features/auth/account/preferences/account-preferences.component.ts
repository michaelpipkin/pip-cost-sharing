import { Component, effect, inject, Signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import { Group } from '@models/group';

@Component({
  selector: 'app-account-preferences',
  templateUrl: './account-preferences.component.html',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    DocRefCompareDirective,
  ],
})
export class AccountPreferencesComponent {
  protected readonly analytics = inject(AnalyticsService);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly userService = inject(UserService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);

  currentUser = this.userStore.user;
  activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  groupForm = this.fb.group({
    groupRef: [this.currentUser()?.defaultGroupRef ?? null],
  });

  constructor() {
    effect(() => {
      this.groupForm.patchValue({
        groupRef: this.currentUser()?.defaultGroupRef ?? null,
      });
    });
  }

  get g() {
    return this.groupForm.controls;
  }

  async onSubmitGroup(): Promise<void> {
    const groupRef = this.groupForm.value.groupRef ?? null;
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
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'update_default_group',
          message: error.message,
        });
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
