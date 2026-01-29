import { Component, inject, Signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from '@models/currency-config.interface';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@shared/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrl: './add-group.component.scss',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatOptionModule,
  ],
})
export class AddGroupComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly dialogRef = inject(MatDialogRef<AddGroupComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly userStore = inject(UserStore);
  protected readonly demoService = inject(DemoService);
  protected readonly groupService = inject(GroupService);
  protected readonly snackbar = inject(MatSnackBar);
  private readonly analytics = inject(AnalyticsService);

  supportedCurrencies = SUPPORTED_CURRENCIES;

  newGroupForm = this.fb.group({
    groupName: ['', Validators.required],
    displayName: ['', Validators.required],
    autoAddMembers: [false],
    currencyCode: ['USD', Validators.required],
  });
  user: Signal<User> = this.userStore.user;

  public get f() {
    return this.newGroupForm.controls;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.newGroupForm.value;
      const currencyConfig = getCurrencyConfig(val.currencyCode);
      const newGroup: Partial<Group> = {
        name: val.groupName,
        active: true,
        autoAddMembers: val.autoAddMembers,
        currencyCode: val.currencyCode,
        currencySymbol: currencyConfig.symbol,
        decimalPlaces: currencyConfig.decimalPlaces,
        archived: false,
      };
      const newMember: Partial<Member> = {
        userRef: this.user().ref,
        displayName: val.displayName,
        email: this.user().email,
        active: true,
        groupAdmin: true,
      };
      const groupRef = await this.groupService.addGroup(newGroup, newMember);
      this.dialogRef.close(groupRef);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'add_group',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not add group' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
