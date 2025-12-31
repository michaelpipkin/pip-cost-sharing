import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { Category } from '@models/category';
import { Expense, ExpenseDto } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split, SplitDto } from '@models/split';
import { CameraService } from '@services/camera.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { ReceiptDialogComponent } from '@shared/receipt-dialog/receipt-dialog.component';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FirebaseError } from 'firebase/app';
import { DocumentReference } from 'firebase/firestore';
import { getDownloadURL, getStorage } from 'firebase/storage';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  model,
  Signal,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
} from '@angular/material/dialog';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import {
  FileSelectionDialogComponent,
  FileSelectionOption,
} from '@shared/file-selection-dialog/file-selection-dialog.component';

@Component({
  selector: 'app-edit-expense',
  templateUrl: './edit-expense.component.html',
  styleUrl: './edit-expense.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatIconModule,
    MatTableModule,
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DateShortcutKeysDirective,
    DocRefCompareDirective,
  ],
})
export class EditExpenseComponent {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly fb = inject(FormBuilder);
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
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  #currentGroup: Signal<Group> = this.groupStore.currentGroup;

  expense = signal<Expense>(this.route.snapshot.data.expense);

  categories = computed<Category[]>(() => {
    return this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.ref.eq(this.expense().categoryRef));
  });
  expenseMembers = computed<Member[]>(() => {
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.ref.eq(this.expense().paidByMemberRef));
  });
  splitMembers = computed<Member[]>(() => {
    const splitMembers: DocumentReference<Member>[] = this.expense().splits.map(
      (s: Split) => s.owedByMemberRef
    );
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMembers.includes(m.ref));
  });

  fileName = model<string>('');
  receiptFile = model<File | null>(null);
  receiptUrl = model<string>(null);
  splitByPercentage = model<boolean>(false);

  datePicker = viewChild<ElementRef>('datePicker');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  editExpenseForm = this.fb.group({
    paidByMember: [null as DocumentReference<Member>, Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    category: [null as DocumentReference<Category>, Validators.required],
    sharedAmount: [0, Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  constructor() {
    afterNextRender(() => {
      const expense = this.expense();
      this.totalAmountField().nativeElement.value =
        this.decimalPipe.transform(expense.totalAmount, '1.2-2') || '0.00';
      this.allocatedAmountField().nativeElement.value =
        this.decimalPipe.transform(expense.allocatedAmount, '1.2-2') || '0.00';
      this.memberAmounts().forEach((elementRef: ElementRef, index: number) => {
        elementRef.nativeElement.value =
          this.decimalPipe.transform(
            expense.splits[index].assignedAmount,
            '1.2-2'
          ) || '0.00';
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    effect(() => {
      const expense = this.expense();
      this.loadExpense(expense);
    });
  }

  async loadExpense(expense: Expense): Promise<void> {
    this.splitByPercentage.set(expense.splitByPercentage);
    this.editExpenseForm.patchValue({
      paidByMember: expense.paidByMemberRef,
      date: expense.date,
      amount: expense.totalAmount,
      description: expense.description,
      category: expense.categoryRef,
      sharedAmount: expense.sharedAmount,
      allocatedAmount: expense.allocatedAmount,
    });
    expense.splits.forEach((s: Split) => {
      this.splits.push(
        this.fb.group({
          owedByMemberRef: s.owedByMemberRef,
          assignedAmount: s.assignedAmount,
          percentage: s.percentage,
          allocatedAmount: s.allocatedAmount,
        })
      );
    });
    if (expense.hasReceipt) {
      try {
        const url = await getDownloadURL(expense.receiptRef);
        if (!!url) {
          this.receiptUrl.set(<string>url);
        }
      } catch (error) {
        if (error instanceof FirebaseError) {
          if (error.code !== 'storage/object-not-found') {
            logEvent(this.analytics, 'receipt-retrieval-error');
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'firebase_receipt_retrieval',
              message: error.message,
            });
          }
        } else if (error instanceof Error) {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: error.message },
          });
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'firebase_receipt_retrieval',
            message: error.message,
          });
        } else {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Something went wrong - could not retrieve receipt' },
          });
        }
      }
    }
    this.loading.loadingOff();
  }

  get splits(): FormArray {
    return this.editExpenseForm.get('splits') as FormArray;
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

  createSplitFormGroup(): FormGroup {
    const existingMembers = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberRef').value.id
    );
    const availableMembers = this.expenseMembers().filter(
      (m) => !existingMembers.includes(m.id)
    );
    return this.fb.group({
      owedByMemberRef: [
        availableMembers.length > 0 ? availableMembers[0].ref : null,
        Validators.required,
      ],
      assignedAmount: [
        this.localeService.getFormattedZero(),
        Validators.required,
      ],
      percentage: [0.0],
      allocatedAmount: [0.0],
    });
  }

  amountValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === 0 ? { zeroAmount: true } : null;
    };
  }

  get e() {
    return this.editExpenseForm.controls;
  }

  get splitsFormArray(): FormArray {
    return this.editExpenseForm.get('splits') as FormArray;
  }

  addSplit(): void {
    this.splitsFormArray.push(this.createSplitFormGroup());
    // Set the value of the newly created input element to '0.00'
    setTimeout(() => {
      const lastInput = this.memberAmounts().find(
        (i) => i.nativeElement.value === ''
      );
      if (lastInput) {
        lastInput.nativeElement.value = this.localeService.getFormattedZero();
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        lastInput.nativeElement.dispatchEvent(event);
      }
    });
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
    this.editExpenseForm.markAsDirty();
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
    this.editExpenseForm.markAsDirty();
  }

  onFileSelected(e): void {
    if (e.target.files.length > 0) {
      const file: File = e.target.files[0];
      this.processSelectedFile(file);
    }
  }

  removeFile(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
    this.editExpenseForm.markAsDirty();
  }

  /**
   * Opens file selection dialog
   * First checks if user has accepted receipt policy
   * On native platforms: shows dialog to choose camera, gallery, file browser, or clipboard
   * On web/PWA: shows dialog to choose file browser or clipboard
   */
  async openFileSelectionDialog(): Promise<void> {
    // Check if user has accepted receipt policy (checked at click time, not component load)
    const currentUser = this.userStore.user();
    if (!currentUser?.receiptPolicy) {
      const policyDialogRef = this.dialog.open(ReceiptDialogComponent, {
        disableClose: true,
        maxWidth: '600px',
      });

      const accepted = await new Promise<boolean>((resolve) => {
        policyDialogRef.afterClosed().subscribe((value) => resolve(value));
      });

      if (!accepted) {
        // User cancelled or didn't accept policy
        return;
      }
      // Policy now accepted, continue with file selection
    }

    const isCameraAvailable = this.cameraService.isAvailable();
    const isClipboardAvailable = !!navigator.clipboard?.read;

    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '400px',
      data: {
        showCameraOption: isCameraAvailable,
        showGalleryOption: isCameraAvailable,
        showClipboardOption: isClipboardAvailable,
      },
    };

    const dialogRef = this.dialog.open(
      FileSelectionDialogComponent,
      dialogConfig
    );

    const result: FileSelectionOption | null = await new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((value) => resolve(value));
    });

    if (!result) {
      // User cancelled
      return;
    }

    try {
      let file: File | null = null;

      if (result === 'camera') {
        file = await this.cameraService.takePicture();
      } else if (result === 'gallery') {
        file = await this.cameraService.selectFromGallery();
      } else if (result === 'file') {
        // Trigger the hidden file input
        const fileInput = document.querySelector(
          'input[type="file"]'
        ) as HTMLInputElement;
        if (fileInput) {
          fileInput.click();
        }
        return; // The onFileSelected handler will process the file
      } else if (result === 'clipboard') {
        await this.pasteFromClipboard();
        return;
      }

      // Process the file from camera or gallery
      if (file) {
        this.processSelectedFile(file);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Failed to select file. Please try again' },
      });
    }
  }

  /**
   * Reads an image from the clipboard and processes it as a receipt
   * Uses the Clipboard API to read image data
   */
  private async pasteFromClipboard(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1] || 'png';
          const file = new File([blob], `pasted-receipt.${extension}`, {
            type: imageType,
          });
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
        data: {
          message: 'Unable to read from clipboard. Please check permissions.',
        },
      });
    }
  }

  /**
   * Process a file (from camera, gallery, or file browser)
   * Validates size and sets the file in the component state
   */
  private processSelectedFile(file: File): void {
    if (file.size > 5 * 1024 * 1024) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'File is too large. File size limited to 5MB' },
      });
    } else {
      this.receiptFile.set(file);
      this.fileName.set(file.name);
      this.editExpenseForm.markAsDirty();
    }
  }

  onSplitByPercentageClick(): void {
    this.splitByPercentage.set(true);
    this.editExpenseForm.markAsDirty();
    this.allocateByPercentage();
  }

  onSplitByAmountClick(): void {
    this.splitByPercentage.set(false);
    this.editExpenseForm.markAsDirty();
    this.allocateSharedAmounts();
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    const val = this.editExpenseForm.value;
    const input = {
      totalAmount: val.amount,
      sharedAmount: val.sharedAmount,
      allocatedAmount: val.allocatedAmount,
      splits: this.splitsFormArray.value.map((split) => ({
        owedByMemberRef: split.owedByMemberRef,
        assignedAmount: split.assignedAmount,
        percentage: split.percentage,
        allocatedAmount: split.allocatedAmount,
      })),
    };

    const result = this.allocationUtils.allocateSharedAmounts(input);

    // Update the form with the adjusted shared amount if it changed
    if (result.adjustedSharedAmount !== val.sharedAmount) {
      this.editExpenseForm.patchValue({
        sharedAmount: result.adjustedSharedAmount,
      });
    }

    // Apply the allocation results to the form array
    this.allocationUtils.applyAllocationToFormArray(
      this.splitsFormArray,
      result
    );
  }

  allocateByPercentage(): void {
    var totalPercentage: number = 0;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.getRawValue()];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberRef && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number =
              this.localeService.roundToCurrency(+(100 - totalPercentage));
            splits[i].percentage = remainingPercentage;
            this.splitsFormArray.at(i).patchValue({
              percentage: remainingPercentage,
            });
          }
          i++;
        }
      }
      const splitCount: number = splits.filter(
        (s) => s.owedByMemberRef !== null
      ).length;
      const val = this.editExpenseForm.value;
      const totalAmount: number = +val.amount;
      splits.forEach((split) => {
        split.allocatedAmount = this.localeService.roundToCurrency(
          +((totalAmount * +split.percentage) / 100)
        );
      });
      const allocatedTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.allocatedAmount), 0)
      );
      const percentageTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.percentage), 0)
      );
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = this.localeService.roundToCurrency(
          +(totalAmount - allocatedTotal)
        );
        const increment = this.localeService.getSmallestIncrement();
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += increment;
            diff = this.localeService.roundToCurrency(+(diff - increment));
          } else {
            splits[i].allocatedAmount -= increment;
            diff = this.localeService.roundToCurrency(+(diff + increment));
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      // Patch the allocatedAmount back into the form array
      splits.forEach((split, index) => {
        this.splitsFormArray.at(index).patchValue({
          allocatedAmount: split.allocatedAmount,
        });
      });
    }
  }

  getAssignedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.assignedAmount)),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.allocatedAmount)),
        0
      )
    );

  expenseFullyAllocated = (): boolean =>
    this.editExpenseForm.value.amount == this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return index === this.splitsFormArray.length - 1;
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
          const val = this.editExpenseForm.getRawValue();
          const expenseDate = val.date.toIsoFormat();
          const changes: Partial<ExpenseDto> = {
            date: expenseDate,
            description: val.description,
            categoryRef: val.category,
            paidByMemberRef: val.paidByMember,
            sharedAmount: +val.sharedAmount,
            allocatedAmount: +val.allocatedAmount,
            totalAmount: +val.amount,
            splitByPercentage: this.splitByPercentage(),
            paid: false,
          };
          let splits: Partial<SplitDto>[] = [];
          this.splitsFormArray.getRawValue().forEach((s) => {
            const split: Partial<SplitDto> = {
              date: expenseDate,
              categoryRef: val.category,
              assignedAmount: +s.assignedAmount,
              percentage: +s.percentage,
              allocatedAmount: +s.allocatedAmount,
              paidByMemberRef: val.paidByMember,
              owedByMemberRef: s.owedByMemberRef,
              paid: s.owedByMemberRef.eq(val.paidByMember),
            };
            splits.push(split);
          });
          await this.expenseService.updateExpense(
            this.#currentGroup().id,
            this.expense().ref,
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
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'edit_expense',
              message: error.message,
            });
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
      data: {
        operation: 'Delete',
        target: `this expense`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.expenseService.deleteExpense(
            this.#currentGroup().id,
            this.expense().ref
          );
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
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_expense',
              message: error.message,
            });
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

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index !== undefined) {
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          if (this.splitByPercentage()) {
            this.allocateByPercentage();
          } else {
            this.allocateSharedAmounts();
          }
        }
      } else {
        const control = this.editExpenseForm.get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.updateTotalAmount();
        }
      }
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
