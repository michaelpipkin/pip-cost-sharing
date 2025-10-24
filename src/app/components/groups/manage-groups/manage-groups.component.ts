import { Component, inject, model, OnInit, signal, Signal } from '@angular/core';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Group } from '@models/group';
import {
  SUPPORTED_CURRENCIES,
  getCurrencyConfig,
} from '@models/currency-config.interface';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { getAnalytics, logEvent } from 'firebase/analytics';

@Component({
  selector: 'app-manage-groups',
  templateUrl: './manage-groups.component.html',
  styleUrl: './manage-groups.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
})
export class ManageGroupsComponent implements OnInit {
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly loading = inject(LoadingService);
  protected readonly demoService = inject(DemoService);
  protected readonly data = inject(MAT_DIALOG_DATA);

  selectedGroup = model<Group | null>(this.data.group as Group);
  groupHasExpenses = signal<boolean>(false);
  supportedCurrencies = SUPPORTED_CURRENCIES;

  userAdminGroups: Signal<Group[]> = this.groupStore.userAdminGroups;

  editGroupForm = this.fb.group({
    groupId: [''],
    groupName: ['', Validators.required],
    active: [false],
    autoAddMembers: [false],
    currencyCode: ['USD', Validators.required],
  });

  async ngOnInit(): Promise<void> {
    if (
      this.selectedGroup() !== null &&
      this.userAdminGroups().includes(this.selectedGroup())
    ) {
      const group = this.selectedGroup();

      // Check if group has expenses
      const hasExpenses = await this.expenseService.hasExpensesForGroup(group.id);
      this.groupHasExpenses.set(hasExpenses);

      this.editGroupForm.patchValue({
        groupId: group.id,
        groupName: group.name,
        active: group.active ?? false,
        autoAddMembers: group.autoAddMembers ?? false,
        currencyCode: group.currencyCode ?? 'USD',
      });

      // Disable currency field if expenses exist
      if (hasExpenses) {
        this.editGroupForm.controls.currencyCode.disable();
      }
    }
  }

  public get f() {
    return this.editGroupForm.controls;
  }

  async onSelectGroup(): Promise<void> {
    const group = this.userAdminGroups().find(
      (g) => g.id === this.f.groupId.value
    );
    this.selectedGroup.set(group);

    // Check if group has expenses
    const hasExpenses = await this.expenseService.hasExpensesForGroup(group.id);
    this.groupHasExpenses.set(hasExpenses);

    // Enable/disable currency field based on expenses
    if (hasExpenses) {
      this.editGroupForm.controls.currencyCode.disable();
    } else {
      this.editGroupForm.controls.currencyCode.enable();
    }

    this.editGroupForm.patchValue({
      groupName: this.selectedGroup().name,
      active: this.selectedGroup().active ?? false,
      autoAddMembers: this.selectedGroup().autoAddMembers ?? false,
      currencyCode: this.selectedGroup().currencyCode ?? 'USD',
    });
    this.editGroupForm.markAsPristine();
    this.editGroupForm.markAsUntouched();
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const form = this.editGroupForm.getRawValue();
    const currencyConfig = getCurrencyConfig(form.currencyCode);
    const changes: Partial<Group> = {
      name: form.groupName,
      active: form.active,
      autoAddMembers: form.autoAddMembers,
      currencyCode: form.currencyCode,
      currencySymbol: currencyConfig.symbol,
      decimalPlaces: currencyConfig.decimalPlaces,
    };
    this.loading.loadingOn();
    try {
      await this.groupService.updateGroup(this.selectedGroup().ref, changes);
      this.dialogRef.close({
        success: true,
        operation: 'saved',
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_group',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not edit group.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }
}
