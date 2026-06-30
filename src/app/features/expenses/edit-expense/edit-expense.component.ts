import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  Signal,
  signal,
  viewChildren,
} from '@angular/core';
import { form, FormField, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import {
  FileSelectionDialogComponent,
  FileSelectionOption,
} from '@components/file-selection-dialog/file-selection-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { ReceiptDialogComponent } from '@components/receipt-dialog/receipt-dialog.component';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { DateShortcutKeysDirective } from '@directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Expense, ExpenseDto, ExpenseForm, ExpenseSplitItemForm } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split, SplitDto } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CameraService } from '@services/camera.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AllocationInput, AllocationSplit, AllocationUtilsService } from '@utils/allocation-utils.service';
import { toIsoFormat } from '@utils/date-utils';
import { SplitMethod } from '@utils/split-method';
import { StringUtils } from '@utils/string-utils.service';
import { FirebaseError } from 'firebase/app';
import { getDownloadURL, getStorage } from 'firebase/storage';

@Component({
  selector: 'app-edit-expense',
  templateUrl: './edit-expense.component.html',
  styleUrl: './edit-expense.component.scss',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatIconModule,
    DecimalPipe,
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DateShortcutKeysDirective,
    DocRefCompareDirective,
    SplitMethodToggleComponent,
    FormField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditExpenseComponent {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly userStore = inject(UserStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly cameraService = inject(CameraService);
  protected readonly demoService = inject(DemoService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  readonly #currentGroup: Signal<Group | null> = this.groupStore.currentGroup;

  expense = signal<Expense>(this.route.snapshot.data.expense);

  categories = computed<Category[]>(() =>
    this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.ref!.eq(this.expense().categoryRef))
  );
  expenseMembers = computed<Member[]>(() =>
    this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.ref!.eq(this.expense().paidByMemberRef))
  );
  splitMembers = computed<Member[]>(() => {
    const splitMemberIds = new Set(
      this.expense().splits.map((s: Split) => s.owedByMemberRef.id)
    );
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMemberIds.has(m.id));
  });

  splitMethod = signal<SplitMethod>(this.expense().splitMethod);

  fileName = model<string>('');
  receiptFile = model<File | null>(null);
  receiptUrl = model<string>(null as unknown as string);

  inputElements = viewChildren<ElementRef>('inputElement');

  protected readonly expenseModel = signal<Pick<ExpenseForm, 'paidByMember' | 'category' | 'sharedAmount' | 'splits'>>({
    paidByMember: this.expense().paidByMemberRef ?? null,
    category: this.expense().categoryRef ?? null,
    sharedAmount: this.expense().sharedAmount,
    splits: this.expense().splits.map((s: Split) => ({
      owedByMemberRef: s.owedByMemberRef,
      assignedAmount: this.#formatForInput(s.assignedAmount),
      percentage: s.percentage,
      shares: s.shares ?? 0,
      allocatedAmount: s.allocatedAmount,
    })),
  });

  protected readonly expenseFormData = signal<Pick<ExpenseForm, 'date' | 'amount' | 'description' | 'allocatedAmount'>>({
    date: this.expense().date,
    amount: this.#formatForInput(this.expense().totalAmount),
    description: this.expense().description,
    allocatedAmount: this.#formatForInput(this.expense().allocatedAmount),
  });

  protected readonly expenseForm = form(this.expenseFormData, (p) => {
    required(p.date, { message: '*Required' });
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
    const expense = this.expense();
    const receiptRef = expense.receiptRef;
    if (receiptRef) {
      getDownloadURL(receiptRef).then((url: string) => {
        if (url) this.receiptUrl.set(url);
      }).catch((error: unknown) => {
        if (error instanceof FirebaseError) {
          if (error.code === 'storage/object-not-found') {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Expense Component',
              'firebase_receipt_retrieval',
              error.message
            );
          } else {
            this.analytics.logEvent('receipt-retrieval-error');
          }
        } else if (error instanceof Error) {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: error.message },
          });
          this.analytics.logError(
            'Edit Expense Component',
            'firebase_receipt_retrieval',
            error.message
          );
        } else {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Something went wrong - could not retrieve receipt' },
          });
        }
      });
    }
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

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (file) this.processSelectedFile(file);
    }
  }

  removeFile(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
    this.modelDirty.set(true);
  }

  async openFileSelectionDialog(): Promise<void> {
    const currentUser = this.userStore.user();
    if (!currentUser?.receiptPolicy) {
      const policyDialogRef = this.dialog.open(ReceiptDialogComponent, {
        disableClose: true,
        maxWidth: '600px',
      });
      const accepted = await new Promise<boolean>((resolve) => {
        policyDialogRef.afterClosed().subscribe((value) => resolve(value));
      });
      if (!accepted) return;
    }
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '400px',
      data: { isNativePlatform: this.cameraService.isAvailable() },
    };
    const dialogRef = this.dialog.open(FileSelectionDialogComponent, dialogConfig);
    const result: FileSelectionOption | null = await new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((value) => resolve(value));
    });
    if (!result) return;
    try {
      let file: File | null = null;
      if (result === 'camera') {
        file = await this.cameraService.takePicture();
      } else if (result === 'gallery') {
        file = await this.cameraService.selectFromGallery();
      } else if (result === 'file') {
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.click();
        return;
      } else if (result === 'clipboard') {
        await this.pasteFromClipboard();
        return;
      }
      if (file) this.processSelectedFile(file);
    } catch (error) {
      console.error('Error selecting file:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Failed to select file. Please try again' },
      });
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1] || 'png';
          const file = new File([blob], `pasted-receipt.${extension}`, { type: imageType });
          this.processSelectedFile(file);
          return;
        }
      }
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'No image found in clipboard.' },
      });
    } catch (error) {
      console.error('Error reading from clipboard:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Unable to read from clipboard. Please check permissions.' },
      });
    }
  }

  private processSelectedFile(file: File): void {
    if (file.size > 5 * 1024 * 1024) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'File is too large. File size limited to 5MB' },
      });
    } else {
      this.receiptFile.set(file);
      this.fileName.set(file.name);
      this.modelDirty.set(true);
    }
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

  expenseFullyAllocated = (): boolean =>
    this.stringUtils.toNumber(this.expenseFormData().amount) === this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return this.splitMethod() === 'percentage' && index === this.expenseModel().splits.length - 1;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      this.router.navigate(['/demo/expenses']);
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Action',
        confirmationText:
          'Updating an expense will mark all splits as unpaid. Are you sure you want to continue?',
        cancelButtonText: 'No',
        confirmButtonText: 'Yes',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          const model = this.expenseModel();
          const fd = this.expenseFormData();
          const expenseDate = toIsoFormat(fd.date!);
          const categoryRef = model.category!;
          const paidByMemberRef = model.paidByMember!;
          const changes: Partial<ExpenseDto> = {
            date: expenseDate,
            description: fd.description,
            categoryRef,
            paidByMemberRef,
            sharedAmount: model.sharedAmount,
            allocatedAmount: this.stringUtils.toNumber(fd.allocatedAmount),
            totalAmount: this.stringUtils.toNumber(fd.amount),
            splitMethod: this.splitMethod(),
            paid: false,
          };
          const splits: Partial<SplitDto>[] = model.splits.map(s => ({
            date: expenseDate,
            categoryRef,
            assignedAmount: this.stringUtils.toNumber(s.assignedAmount),
            percentage: s.percentage ?? 0,
            shares: s.shares ?? 0,
            allocatedAmount: s.allocatedAmount,
            paidByMemberRef,
            owedByMemberRef: s.owedByMemberRef!,
            paid: s.owedByMemberRef!.eq(paidByMemberRef),
          }));
          const expenseRef = this.expense().ref!;
          await this.expenseService.updateExpense(
            this.#currentGroup()!.id,
            expenseRef,
            changes,
            splits,
            this.receiptFile()
          );
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Expense updated successfully' },
          });
          if (this.demoService.isInDemoMode()) {
            this.router.navigate(['/demo/expenses']);
          } else {
            this.router.navigate(['/expenses']);
          }
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Expense Component',
              'edit_expense',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not edit expense' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onDelete(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      this.router.navigate(['/demo/expenses']);
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: { operation: 'Delete', target: 'this expense' },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          const expenseRef = this.expense().ref!;
          await this.expenseService.deleteExpense(this.#currentGroup()!.id, expenseRef);
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Expense deleted' },
          });
          if (this.demoService.isInDemoMode()) {
            this.router.navigate(['/demo/expenses']);
          } else {
            this.router.navigate(['/expenses']);
          }
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Expense Component',
              'delete_expense',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: 'Something went wrong - could not delete expense' },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onCancel(): void {
    if (this.demoService.isInDemoMode()) {
      this.router.navigate(['/demo/expenses']);
    } else {
      this.router.navigate(['/expenses']);
    }
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
      data: { sectionId: 'add-edit-expenses' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
