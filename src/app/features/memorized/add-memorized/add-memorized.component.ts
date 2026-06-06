import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  Signal,
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
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { ExpenseSplitItemForm, MemorizedForm } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
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
import { getStorage } from 'firebase/storage';

@Component({
  selector: 'app-add-memorized',
  templateUrl: './add-memorized.component.html',
  styleUrl: './add-memorized.component.scss',
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddMemorizedComponent {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  splitMethod = signal<SplitMethod>('amount');

  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;
  readonly #categories: Signal<Category[]> = this.categoryStore.groupCategories;

  activeCategories = computed<Category[]>(() =>
    this.#categories().filter((c) => c.active)
  );

  autoAddMembers = computed<boolean>(
    () => this.currentGroup()?.autoAddMembers ?? false
  );

  inputElements = viewChildren<ElementRef>('inputElement');

  protected readonly expenseModel = signal<Pick<MemorizedForm, 'paidByMember' | 'category' | 'sharedAmount' | 'splits'>>({
    paidByMember: this.currentMember()?.ref ?? null,
    category: null,
    sharedAmount: 0,
    splits: [],
  });

  protected readonly expenseFormData = signal<Pick<MemorizedForm, 'amount' | 'description' | 'allocatedAmount'>>({
    amount: '0.00',
    description: '',
    allocatedAmount: '0.00',
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

  protected readonly splitsValid = computed(() =>
    this.expenseModel().splits.length >= 1 &&
    this.expenseModel().splits.every(s => s.owedByMemberRef !== null)
  );

  protected updateSplit(index: number, field: keyof ExpenseSplitItemForm, value: unknown): void {
    this.expenseModel.update(m => ({
      ...m,
      splits: m.splits.map((s, i) => i === index ? { ...s, [field]: value } : s),
    }));
  }

  constructor() {
    this.loading.loadingOn();
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    afterNextRender(() => {
      const currentMemberRef = this.currentMember()?.ref;
      if (currentMemberRef && !this.expenseModel().paidByMember) {
        this.expenseModel.update(m => ({ ...m, paidByMember: currentMemberRef }));
      }
      if (this.autoAddMembers()) {
        this.addAllActiveGroupMembers();
      }
      if (this.activeCategories().length === 1) {
        this.expenseModel.update(m => ({ ...m, category: this.activeCategories()[0]!.ref ?? null }));
      }
      this.loading.loadingOff();
    });
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
    const existingIds = new Set(
      this.expenseModel().splits.map(s => s.owedByMemberRef?.id).filter(Boolean)
    );
    const available = this.activeMembers().filter(m => !existingIds.has(m.id));
    this.expenseModel.update(m => ({
      ...m,
      splits: [
        ...m.splits,
        {
          owedByMemberRef: available.length > 0 ? (available[0]!.ref ?? null) : null,
          assignedAmount: this.localeService.getFormattedZero(),
          percentage: 0,
          shares: 0,
          allocatedAmount: 0,
        },
      ],
    }));
    this.recalculateAllocation();
  }

  addAllActiveGroupMembers(): void {
    const existingIds = new Set(
      this.expenseModel().splits.map(s => s.owedByMemberRef?.id).filter(Boolean)
    );
    const newSplits: ExpenseSplitItemForm[] = this.activeMembers()
      .filter(m => !existingIds.has(m.id))
      .map(m => ({
        owedByMemberRef: m.ref ?? null,
        assignedAmount: this.localeService.getFormattedZero(),
        percentage: 0,
        shares: 0,
        allocatedAmount: 0,
      }));
    if (newSplits.length === 0) return;
    this.expenseModel.update(m => ({ ...m, splits: [...m.splits, ...newSplits] }));
    this.recalculateAllocation();
  }

  availableMembersForSplit(index: number): Member[] {
    const selectedIds = new Set(
      this.expenseModel().splits
        .filter((_, i) => i !== index)
        .map(s => s.owedByMemberRef?.id)
        .filter(Boolean)
    );
    return this.activeMembers().filter(m => !selectedIds.has(m.id));
  }

  removeSplit(index: number): void {
    this.expenseModel.update(m => ({
      ...m,
      splits: m.splits.filter((_, i) => i !== index),
    }));
    this.recalculateAllocation();
  }

  onSplitMethodChange(): void {
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

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const model = this.expenseModel();
    const fd = this.expenseFormData();
    const memorized: Partial<Memorized> = {
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
    memorized.splits = splits;
    this.loading.loadingOn();
    try {
      await this.memorizedService.addMemorized(this.currentGroup()!.id, memorized);
      this.snackbar.openFromComponent(CustomSnackbarComponent, { data: { message: 'Memorized expense added' } });
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, { data: { message: error.message } });
        this.analytics.logError('Add Memorized Component', 'memorize_expense', 'Failed to memorize expense', error.message);
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, { data: { message: 'Something went wrong - could not memorize expense' } });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onCancel(): void {
    this.router.navigate(['/memorized']);
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
