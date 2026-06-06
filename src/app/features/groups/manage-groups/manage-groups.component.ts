import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  Signal,
  signal,
} from '@angular/core';
import { disabled, form, FormField, required } from '@angular/forms/signals';
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
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import {
  getCurrencyConfig,
  SUPPORTED_CURRENCIES,
} from '@models/currency-config.interface';
import { Group, ManageGroupForm } from '@models/group';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';

@Component({
  selector: 'app-manage-groups',
  templateUrl: './manage-groups.component.html',
  styleUrl: './manage-groups.component.scss',
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatSlideToggleModule,
    DocRefCompareDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageGroupsComponent {
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly dialog = inject(MatDialog);
  protected readonly dialogRef = inject(MatDialogRef<ManageGroupsComponent>);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly loading = inject(LoadingService);
  protected readonly demoService = inject(DemoService);
  protected readonly data = inject(MAT_DIALOG_DATA);

  selectedGroup = model<Group | null>(this.data.group as Group);
  supportedCurrencies = SUPPORTED_CURRENCIES;

  protected readonly userAdminGroups: Signal<Group[]> =
    this.groupStore.userAdminGroups;
  protected readonly adminGroupIds = computed(() =>
    this.userAdminGroups().map((g) => g.id)
  );

  protected readonly groupRef = signal<ManageGroupForm['groupRef']>(null);
  protected readonly groupRefValid = computed(() => this.groupRef() !== null);
  protected readonly selectedGroupHasExpenses = signal(false);

  protected readonly editGroupModel = signal<Omit<ManageGroupForm, 'groupRef'>>({
    groupName: '',
    active: false,
    autoAddMembers: false,
    currencyCode: 'USD',
  });

  private readonly lastLoadedValues = signal<Omit<ManageGroupForm, 'groupRef'>>(
    {
      groupName: '',
      active: false,
      autoAddMembers: false,
      currencyCode: 'USD',
    }
  );

  protected readonly hasChanges = computed(() => {
    if (!this.selectedGroup()) return false;
    const current = this.editGroupForm().value();
    const loaded = this.lastLoadedValues();
    return (
      current.groupName !== loaded.groupName ||
      current.active !== loaded.active ||
      current.autoAddMembers !== loaded.autoAddMembers ||
      current.currencyCode !== loaded.currencyCode
    );
  });

  protected readonly editGroupForm = form(this.editGroupModel, (p) => {
    required(p.groupName, { message: '*Required' });
    required(p.currencyCode, { message: '*Required' });
    disabled(p.currencyCode, {
      when: () => this.selectedGroupHasExpenses(),
    });
  });

  constructor() {
    this.loading.loadingOn();
    afterNextRender(async () => {
      await this.initializeForm();
    });
  }

  private async initializeForm(): Promise<void> {
    if (
      this.selectedGroup() !== null &&
      this.adminGroupIds().includes(this.selectedGroup()!.id)
    ) {
      const group = this.selectedGroup()!;
      const values = {
        groupName: group.name,
        active: group.active ?? false,
        autoAddMembers: group.autoAddMembers ?? false,
        currencyCode: group.currencyCode ?? 'USD',
      };
      this.groupRef.set(group.ref ?? null);
      this.editGroupModel.set(values);
      this.lastLoadedValues.set(values);
      this.selectedGroupHasExpenses.set(
        await this.expenseService.checkGroupHasExpenses(group.id)
      );
    } else {
      this.selectedGroup.set(null);
    }
    this.loading.loadingOff();
  }

  async onSelectGroup(selectedGroupRef: ManageGroupForm['groupRef']): Promise<void> {
    this.groupRef.set(selectedGroupRef);
    const group = this.userAdminGroups().find((g) =>
      g.ref!.eq(selectedGroupRef!)
    );
    this.selectedGroup.set(group ?? null);

    const values = {
      groupName: this.selectedGroup()!.name,
      active: this.selectedGroup()!.active ?? false,
      autoAddMembers: this.selectedGroup()!.autoAddMembers ?? false,
      currencyCode: this.selectedGroup()!.currencyCode ?? 'USD',
    };
    this.editGroupModel.set(values);
    this.lastLoadedValues.set(values);
    this.selectedGroupHasExpenses.set(
      await this.expenseService.checkGroupHasExpenses(this.selectedGroup()!.id)
    );
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const val = this.editGroupForm().value();
    const currencyConfig = getCurrencyConfig(val.currencyCode)!;
    const changes: Partial<Group> = {
      name: val.groupName,
      active: val.active,
      autoAddMembers: val.autoAddMembers,
      currencyCode: val.currencyCode,
      currencySymbol: currencyConfig.symbol,
      decimalPlaces: currencyConfig.decimalPlaces,
    };
    this.loading.loadingOn();
    try {
      const selectedGroupRef = this.selectedGroup()!.ref!;
      await this.groupService.updateGroup(selectedGroupRef, changes);
      this.dialogRef.close({ success: true, operation: 'saved' });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Manage Groups Component',
          'edit_group',
          error.message
        );
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
          const selectedGroupRef = this.selectedGroup()!.ref!;
          await this.groupService.updateGroup(selectedGroupRef, {
            archived: true,
            active: false,
          });
          this.dialogRef.close({ success: true, operation: 'archived' });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Manage Groups Component',
              'archive_group',
              error.message
            );
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
      const selectedGroupRef = this.selectedGroup()!.ref!;
      await this.groupService.updateGroup(selectedGroupRef, {
        archived: false,
      });
      this.dialogRef.close({ success: true, operation: 'unarchived' });
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Manage Groups Component',
          'unarchive_group',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message: 'Something went wrong - could not unarchive group',
          },
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
          this.dialogRef.close({ success: true, operation: 'deleted' });
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Manage Groups Component',
              'delete_group',
              error.message
            );
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
