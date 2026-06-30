import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { form, FormField, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { ExpenseSplitItemForm, MemorizedForm } from '@models/expense';
import { Split } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { MemorizedService } from '@services/memorized.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationInput, AllocationSplit, AllocationUtilsService } from '@utils/allocation-utils.service';
import { SplitMethod } from '@utils/split-method';
import { StringUtils } from '@utils/string-utils.service';

@Component({
  selector: 'app-edit-memorized',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatIconModule,
    DecimalPipe,
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DocRefCompareDirective,
    SplitMethodToggleComponent,
    FormField,
  ],
  templateUrl: './edit-memorized.component.html',
  styleUrl: './edit-memorized.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditMemorizedComponent {
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  splitMethod = signal<SplitMethod>(
    (this.route.snapshot.data.memorized as Memorized).splitMethod
  );

  memorized = signal<Memorized>(this.route.snapshot.data.memorized);

  categories = computed<Category[]>(() =>
    this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.ref!.eq(this.memorized().categoryRef))
  );
  memorizedMembers = computed<Member[]>(() =>
    this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.ref!.eq(this.memorized().paidByMemberRef))
  );
  splitMembers = computed<Member[]>(() => {
    const splitMemberIds = new Set(
      this.memorized().splits?.map((s: Partial<Split>) => s.owedByMemberRef?.id).filter(Boolean) ?? []
    );
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMemberIds.has(m.id));
  });

  inputElements = viewChildren<ElementRef>('inputElement');

  protected readonly expenseModel = signal<Pick<MemorizedForm, 'paidByMember' | 'category' | 'sharedAmount' | 'splits'>>({
    paidByMember: this.memorized().paidByMemberRef ?? null,
    category: this.memorized().categoryRef ?? null,
    sharedAmount: this.memorized().sharedAmount,
    splits: (this.memorized().splits ?? []).map((s: Partial<Split>) => ({
      owedByMemberRef: s.owedByMemberRef ?? null,
      assignedAmount: this.#formatForInput(s.assignedAmount ?? 0),
      percentage: s.percentage ?? 0,
      shares: s.shares ?? 0,
      allocatedAmount: s.allocatedAmount ?? 0,
    })),
  });

  protected readonly expenseFormData = signal<Pick<MemorizedForm, 'amount' | 'description' | 'allocatedAmount'>>({
    amount: this.#formatForInput(this.memorized().totalAmount),
    description: this.memorized().description,
    allocatedAmount: this.#formatForInput(this.memorized().allocatedAmount),
  });

  protected readonly expenseForm = form(this.expenseFormData, (p) => {
    required(p.amount, { message: '*Required' });
    validate(p.amount, ({ value }) =>
      this.stringUtils.toNumber(value()) === 0
        ? { kind: 'zeroAmount', message: 'Cannot be zero' }
        : null
    );
    required(p.description, { message: '*Required' });
  });

  protected readonly paidByMemberValid = computed(() => this.expenseModel().paidByMember !== null);
  protected readonly categoryValid = computed(() => this.expenseModel().category !== null);
  protected readonly modelDirty = signal(false);
  protected readonly isFormDirty = computed(() => this.expenseForm().dirty() || this.modelDirty());

  protected readonly splitsValid = computed(() =>
    this.expenseModel().splits.length >= 1 &&
    this.expenseModel().splits.every(s => s.owedByMemberRef !== null)
  );

  protected updateSplit(index: number, field: keyof ExpenseSplitItemForm, value: unknown): void {
    this.modelDirty.set(true);
    this.expenseModel.update(m => ({
      ...m,
      splits: m.splits.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  }

  constructor() {
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    this.loading.loadingOff();
  }

  addSelectFocus(): void {
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        if (this.value === '0.00') {
          this.value = '';
        } else {
          this.select();
        }
      });
    });
  }

  #formatForInput(value: number): string {
    const rounded = this.localeService.roundToCurrency(value);
    const currency = this.localeService.currency();
    return rounded.toFixed(currency.decimalPlaces).replace('.', currency.decimalSeparator);
  }

  #mergeAllocationResults(
    modelSplits: ExpenseSplitItemForm[],
    resultSplits: AllocationSplit[],
    updatePercentage: boolean
  ): ExpenseSplitItemForm[] {
    const updated = modelSplits.map(s => ({ ...s }));
    resultSplits.forEach(split => {
      const ref = split.owedByMemberRef;
      if (!ref) return;
      const key = ref.id || ref.toString();
      const idx = updated.findIndex(s => {
        const r = s.owedByMemberRef;
        return r && (r.id || r.toString()) === key;
      });
      if (idx === -1) return;
      if (updatePercentage) updated[idx]!.percentage = split.percentage;
      updated[idx]!.allocatedAmount = split.allocatedAmount;
    });
    return updated;
  }

  private recalculateAllocation(): void {
    switch (this.splitMethod()) {
      case 'percentage': this.allocateByPercentage(); break;
      case 'shares': this.allocateByShares(); break;
      default: this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    const model = this.expenseModel();
    const fd = this.expenseFormData();
    const input: AllocationInput = {
      totalAmount: this.stringUtils.toNumber(fd.amount),
      sharedAmount: model.sharedAmount,
      allocatedAmount: this.stringUtils.toNumber(fd.allocatedAmount),
      splits: model.splits.map(s => ({
        owedByMemberRef: s.owedByMemberRef,
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    };
    const result = this.allocationUtils.allocateSharedAmounts(input);
    const updatedSplits = this.#mergeAllocationResults(model.splits, result.splits, false);
    this.expenseModel.update(m => ({
      ...m,
      sharedAmount: result.adjustedSharedAmount,
      splits: updatedSplits,
    }));
  }

  allocateByPercentage(): void {
    const model = this.expenseModel();
    if (model.splits.length === 0) return;
    const result = this.allocationUtils.allocateByPercentage({
      totalAmount: this.stringUtils.toNumber(this.expenseFormData().amount),
      splits: model.splits.map(s => ({
        owedByMemberRef: s.owedByMemberRef,
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    const updatedSplits = this.#mergeAllocationResults(model.splits, result.splits, true);
    this.expenseModel.update(m => ({ ...m, splits: updatedSplits }));
  }

  allocateByShares(): void {
    const model = this.expenseModel();
    if (model.splits.length === 0) return;
    const result = this.allocationUtils.allocateByShares({
      totalAmount: this.stringUtils.toNumber(this.expenseFormData().amount),
      splits: model.splits.map(s => ({
        owedByMemberRef: s.owedByMemberRef,
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    const updatedSplits = this.#mergeAllocationResults(model.splits, result.splits, true);
    this.expenseModel.update(m => ({ ...m, splits: updatedSplits }));
  }

  addSplit(): void {
    this.modelDirty.set(true);
    const existingIds = new Set(
      this.expenseModel().splits.map(s => s.owedByMemberRef?.id).filter(Boolean)
    );
    const available = this.splitMembers().find(m => !existingIds.has(m.id));
    this.expenseModel.update(m => ({
      ...m,
      splits: [
        ...m.splits,
        {
          owedByMemberRef: available?.ref ?? null,
          assignedAmount: this.localeService.getFormattedZero(),
          percentage: 0,
          shares: 0,
          allocatedAmount: 0,
        },
      ],
    }));
    this.recalculateAllocation();
  }

  availableMembersForSplit(index: number): Member[] {
    const selectedIds = new Set(
      this.expenseModel().splits
        .filter((_, i) => i !== index)
        .map(s => s.owedByMemberRef?.id)
        .filter(Boolean)
    );
    return this.splitMembers().filter(m => !selectedIds.has(m.id));
  }

  removeSplit(index: number): void {
    this.modelDirty.set(true);
    this.expenseModel.update(m => ({
      ...m,
      splits: m.splits.filter((_, i) => i !== index),
    }));
    this.recalculateAllocation();
  }

  onSplitMethodChange(): void {
    this.recalculateAllocation();
  }

  updateTotalAmount(): void {
    this.recalculateAllocation();
  }

  protected effectivePercentage(index: number): number {
    const splits = this.expenseModel().splits;
    const totalShares = splits.reduce((t, s) => t + (s.shares ?? 0), 0);
    if (totalShares === 0) return 0;
    return ((splits[index]!.shares ?? 0) / totalShares) * 100;
  }

  getAssignedTotal = (): number =>
    this.localeService.roundToCurrency(
      this.expenseModel().splits.reduce(
        (total, s) => total + this.localeService.roundToCurrency(this.stringUtils.toNumber(s.assignedAmount)),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      this.expenseModel().splits.reduce(
        (total, s) => total + this.localeService.roundToCurrency(s.allocatedAmount),
        0
      )
    );

  memorizedFullyAllocated = (): boolean =>
    this.stringUtils.toNumber(this.expenseFormData().amount) === this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return this.splitMethod() === 'percentage' && index === this.expenseModel().splits.length - 1;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const model = this.expenseModel();
      const fd = this.expenseFormData();
      const changes: Partial<Memorized> = {
        description: fd.description,
        categoryRef: model.category!,
        paidByMemberRef: model.paidByMember!,
        sharedAmount: model.sharedAmount,
        allocatedAmount: this.stringUtils.toNumber(fd.allocatedAmount),
        totalAmount: this.stringUtils.toNumber(fd.amount),
        splitMethod: this.splitMethod(),
      };
      const splits: Partial<Split>[] = model.splits.map(s => ({
        assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
        percentage: s.percentage ?? 0,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
        paidByMemberRef: model.paidByMember!,
        owedByMemberRef: s.owedByMemberRef!,
      }));
      changes.splits = splits;
      await this.memorizedService.updateMemorized(
        this.memorized().ref,
        changes
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Memorized expense updated' },
      });
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Edit Memorized Component',
          'edit_memorized_expense',
          'Failed to update memorized expense',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Something went wrong - could not update memorized expense' },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onDelete(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: { operation: 'Delete', target: 'this memorized expense' },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.memorizedService.deleteMemorized(this.memorized().ref);
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Memorized expense deleted' },
          });
          this.router.navigate(['/memorized']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Memorized Component',
              'delete_memorized_expense',
              'Failed to delete memorized expense',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not delete memorized expense' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/memorized']);
  }

  openCalculator(event: Event, field: 'amount' | 'allocatedAmount', index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      const formatted = this.#formatForInput(result);
      if (index === undefined) {
        this.expenseFormData.update(fd => ({ ...fd, [field]: formatted }));
      } else {
        this.expenseModel.update(m => ({
          ...m,
          splits: m.splits.map((s, i) =>
            i === index ? { ...s, assignedAmount: formatted } : s
          ),
        }));
      }
      this.recalculateAllocation();
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'add-edit-memorized' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
