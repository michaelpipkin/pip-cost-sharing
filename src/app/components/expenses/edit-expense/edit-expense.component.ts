import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  OnInit,
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
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FirebaseError } from 'firebase/app';
import { DocumentReference, Timestamp } from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
} from 'firebase/storage';

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
export class EditExpenseComponent implements OnInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly fb = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);

  #currentGroup: Signal<Group> = this.groupStore.currentGroup;

  expense = signal<Expense>(null);

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
  }

  async ngOnInit(): Promise<void> {
    const expense: Expense = this.route.snapshot.data.expense;
    this.expense.set(expense);
    this.splitByPercentage.set(expense.splitByPercentage);
    this.editExpenseForm.patchValue({
      paidByMember: expense.paidByMemberRef,
      date: expense.date.toDate(),
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
            this.snackBar.open(error.message, 'Close');
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'firebase_receipt_retrieval',
              message: error.message,
            });
          }
        } else if (error instanceof Error) {
          this.snackBar.open(error.message, 'Close');
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'firebase_receipt_retrieval',
            message: error.message,
          });
        } else {
          this.snackBar.open(
            'Something went wrong - could not retrieve receipt.',
            'Close'
          );
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
      assignedAmount: ['0.00', Validators.required],
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
        lastInput.nativeElement.value = '0.00';
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
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open(
          'File is too large. File size limited to 5MB.',
          'OK'
        );
      } else {
        this.receiptFile.set(file);
        this.fileName.set(file.name);
        this.editExpenseForm.markAsDirty();
      }
    }
  }

  removeFile(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
    this.editExpenseForm.markAsDirty();
  }

  toggleSplitByPercentage(): void {
    this.splitByPercentage.set(!this.splitByPercentage());
    this.editExpenseForm.markAsDirty();
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    if (this.splitsFormArray.length === 0) {
      return;
    }

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
      let splits = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberRef && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number = +(
              100 - totalPercentage
            ).toFixed(2);
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
      const totalAmount: number = val.amount;
      splits.forEach((split) => {
        split.allocatedAmount = +(
          (totalAmount * +split.percentage) /
          100
        ).toFixed(2);
      });
      const allocatedTotal: number = +splits
        .reduce((total, s) => (total += s.allocatedAmount), 0)
        .toFixed(2);
      const percentageTotal: number = +splits
        .reduce((total, s) => (total += s.percentage), 0)
        .toFixed(2);
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = +(totalAmount - allocatedTotal).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff = +(diff - 0.01).toFixed(2);
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff = +(diff + 0.01).toFixed(2);
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
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  expenseFullyAllocated = (): boolean =>
    this.editExpenseForm.value.amount == this.getAllocatedTotal();

  async onSubmit(): Promise<void> {
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
          const val = this.editExpenseForm.value;
          const expenseDate = Timestamp.fromDate(val.date);
          const changes: Partial<Expense> = {
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
          let splits: Partial<Split>[] = [];
          this.splitsFormArray.value.forEach((s) => {
            const split: Partial<Split> = {
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
          this.snackBar.open('Expense updated successfully.', 'OK');
          this.router.navigate(['/expenses']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackBar.open(error.message, 'Close');
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'edit_expense',
              message: error.message,
            });
          } else {
            this.snackBar.open(
              'Something went wrong - could not edit expense.',
              'Close'
            );
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onDelete(): void {
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
          if (this.receiptUrl()) {
            const fileRef = ref(
              this.storage,
              `groups/${this.#currentGroup().id}/receipts/${this.expense().id}`
            );
            await deleteObject(fileRef);
          }
          this.snackBar.open('Expense deleted.', 'OK');
          this.router.navigate(['/expenses']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackBar.open(error.message, 'Close');
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_expense',
              message: error.message,
            });
          } else {
            this.snackBar.open(
              'Something went wrong - could not delete expense.',
              'Close'
            );
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/expenses']);
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
