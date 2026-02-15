import {
  Component,
  computed,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
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
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
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
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { DocumentReference } from 'firebase/firestore';

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
    DocRefCompareDirective,
  ],
})
export class ManageGroupsComponent {
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly dialog = inject(MatDialog);
  protected readonly dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  protected readonly fb = inject(FormBuilder);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly demoService = inject(DemoService);
  protected readonly data = inject(MAT_DIALOG_DATA);

  selectedGroup = model<Group | null>(this.data.group as Group);
  groupHasExpenses = signal<boolean>(false);
  supportedCurrencies = SUPPORTED_CURRENCIES;

  userAdminGroups: Signal<Group[]> = this.groupStore.userAdminGroups;

  adminGroupIds = computed(() => this.userAdminGroups().map((g) => g.id));

  editGroupForm = this.fb.group({
    groupRef: [null as DocumentReference<Group> | null, Validators.required],
    groupName: ['', Validators.required],
    active: [false],
    autoAddMembers: [false],
    currencyCode: ['USD', Validators.required],
  });

  constructor() {
    this.loading.loadingOn();
    this.initializeForm();
  }

  private async initializeForm(): Promise<void> {
    if (
      this.selectedGroup() !== null &&
      this.adminGroupIds().includes(this.selectedGroup()!.id)
    ) {
      const group = this.selectedGroup()!;

      // Check if group has expenses
      const hasExpenses = await this.expenseService.hasExpensesForGroup(
        group.id
      );
      this.groupHasExpenses.set(hasExpenses);

      this.editGroupForm.patchValue({
        groupRef: group.ref ?? null,
        groupName: group.name,
        active: group.active ?? false,
        autoAddMembers: group.autoAddMembers ?? false,
        currencyCode: group.currencyCode ?? 'USD',
      });

      if (hasExpenses) {
        this.editGroupForm.controls.currencyCode.disable();
      }
    } else {
      this.selectedGroup.set(null);
    }
    this.loading.loadingOff();
  }

  public get f() {
    return this.editGroupForm.controls;
  }

  async onSelectGroup(): Promise<void> {
    const group = this.userAdminGroups().find((g) =>
      g.ref!.eq(this.f.groupRef.value!)
    );
    this.selectedGroup.set(group ?? null);

    // Check if group has expenses
    const hasExpenses = await this.expenseService.hasExpensesForGroup(
      group!.id
    );
    this.groupHasExpenses.set(hasExpenses);

    // Enable/disable currency field based on expenses
    if (hasExpenses) {
      this.editGroupForm.controls.currencyCode.disable();
    } else {
      this.editGroupForm.controls.currencyCode.enable();
    }

    this.editGroupForm.patchValue({
      groupName: this.selectedGroup()!.name,
      active: this.selectedGroup()!.active ?? false,
      autoAddMembers: this.selectedGroup()!.autoAddMembers ?? false,
      currencyCode: this.selectedGroup()!.currencyCode ?? 'USD',
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
    const currencyConfig = getCurrencyConfig(form.currencyCode!)!;
    const changes: Partial<Group> = {
      name: form.groupName ?? undefined,
      active: form.active ?? undefined,
      autoAddMembers: form.autoAddMembers ?? undefined,
      currencyCode: form.currencyCode ?? undefined,
      currencySymbol: currencyConfig.symbol,
      decimalPlaces: currencyConfig.decimalPlaces,
    };
    this.loading.loadingOn();
    try {
      await this.groupService.updateGroup(this.selectedGroup()!.ref!, changes);
      this.dialogRef.close({
        success: true,
        operation: 'saved',
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'edit_group',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not edit group' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  archiveGroup(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: 'Archive Group',
        confirmationText:
          'Are you sure you want to archive this group? Archived groups will be hidden from the main group list but can be unarchived later.',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Archive',
      },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        this.loading.loadingOn();
        try {
          await this.groupService.updateGroup(this.selectedGroup()!.ref!, {
            archived: true,
            active: false,
          });
          this.dialogRef.close({
            success: true,
            operation: 'archived',
          });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logEvent('error', {
              component: this.constructor.name,
              action: 'archive_group',
              message: error.message,
            });
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message: 'Something went wrong - could not archive group',
              },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  async unarchiveGroup(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    this.loading.loadingOn();
    try {
      await this.groupService.updateGroup(this.selectedGroup()!.ref!, {
        archived: false,
      });
      this.dialogRef.close({
        success: true,
        operation: 'unarchived',
      });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logEvent('error', {
          component: this.constructor.name,
          action: 'unarchive_group',
          message: error.message,
        });
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not unarchive group' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  deleteGroup(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        dialogTitle: 'Delete Group',
        confirmationText:
          'Are you sure you want to permanently delete this group? This will delete all expenses, members, categories, and other data associated with this group. This action cannot be undone.',
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete',
      },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        this.loading.loadingOn();
        try {
          await this.groupService.deleteGroup(this.selectedGroup()!.id);
          this.dialogRef.close({
            success: true,
            operation: 'deleted',
          });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logEvent('error', {
              component: this.constructor.name,
              action: 'delete_group',
              message: error.message,
            });
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message: 'Something went wrong - could not delete group',
              },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }
}
