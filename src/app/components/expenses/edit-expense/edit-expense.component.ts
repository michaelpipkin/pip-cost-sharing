import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  afterRender,
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
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { FirebaseError } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import { Url } from 'url';
import { AddEditExpenseHelpComponent } from '../add-edit-expense-help/add-edit-expense-help.component';

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
  ],
})
export class EditExpenseComponent implements OnInit {
  storage = inject(getStorage);
  analytics = inject(getAnalytics);
  fb = inject(FormBuilder);
  router = inject(Router);
  route = inject(ActivatedRoute);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  decimalPipe = inject(DecimalPipe);
  stringUtils = inject(StringUtils);

  #currentGroup: Signal<Group> = this.groupService.currentGroup;

  expense = signal<Expense>(null);

  categories = computed<Category[]>(() => {
    return this.categoryService
      .groupCategories()
      .filter((c) => c.active || c.id == this.expense().categoryId);
  });
  expenseMembers = computed<Member[]>(() => {
    return this.memberService
      .groupMembers()
      .filter((m) => m.active || m.id == this.expense().paidByMemberId);
  });
  splitMembers = computed<Member[]>(() => {
    const splitMemberIds: string[] = this.expense().splits.map(
      (s: Split) => s.owedByMemberId
    );
    return this.memberService
      .groupMembers()
      .filter((m) => m.active || splitMemberIds.includes(m.id));
  });

  fileName = model<string>('');
  receiptFile = model<File>(null);
  receiptUrl = model<Url>(null);

  datePicker = viewChild<ElementRef>('datePicker');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  editExpenseForm = this.fb.group({
    paidByMemberId: ['', Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    categoryId: ['', Validators.required],
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
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    const expense = this.route.snapshot.data.expense;
    this.expense.set(expense);
    this.editExpenseForm.patchValue({
      paidByMemberId: expense.paidByMemberId,
      date: expense.date.toDate(),
      amount: expense.totalAmount,
      description: expense.description,
      categoryId: expense.categoryId,
      sharedAmount: expense.sharedAmount,
      allocatedAmount: expense.allocatedAmount,
    });
    expense.splits.forEach((s: Split) => {
      this.splits.push(
        this.fb.group({
          owedByMemberId: [s.owedByMemberId, Validators.required],
          assignedAmount: [s.assignedAmount, Validators.required],
          allocatedAmount: [s.allocatedAmount],
        })
      );
    });
    if (expense.hasReceipt) {
      const storageUrl = `groups/${this.#currentGroup().id}/receipts/${expense.id}`;
      getDownloadURL(ref(this.storage, storageUrl))
        .then((url: unknown) => {
          if (!!url) {
            this.receiptUrl.set(<Url>url);
          }
        })
        .catch((err: FirebaseError) => {
          if (err.code !== 'storage/object-not-found') {
            logEvent(this.analytics, 'receipt-retrieval-error');
          }
        });
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
    const existingMemberIds = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberId').value
    );
    const availableMembers = this.expenseMembers().filter(
      (m) => !existingMemberIds.includes(m.id)
    );
    return this.fb.group({
      owedByMemberId: [
        availableMembers.length > 0 ? availableMembers[0].id : '',
        Validators.required,
      ],
      assignedAmount: ['0.00', Validators.required],
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
    this.allocateSharedAmounts();
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    this.allocateSharedAmounts();
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
  }

  allocateSharedAmounts(): void {
    if (this.splitsFormArray.length > 0) {
      let splits: Split[] = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberId && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          i++;
        }
      }
      const splitCount: number = splits.filter(
        (s) => s.owedByMemberId !== ''
      ).length;
      const splitTotal: number = this.getAssignedTotal();
      const val = this.editExpenseForm.value;
      const totalAmount: number = val.amount;
      let sharedAmount: number = val.sharedAmount;
      const allocatedAmount: number = val.allocatedAmount;
      const totalSharedSplits: number = +(
        sharedAmount +
        allocatedAmount +
        splitTotal
      ).toFixed(2);
      if (totalAmount != totalSharedSplits) {
        sharedAmount = +(totalAmount - splitTotal - allocatedAmount).toFixed(2);
        this.editExpenseForm.patchValue({
          sharedAmount: sharedAmount,
        });
      }
      // First, split the shared amount equally among all splits
      splits.forEach((split: Split) => {
        split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
      });
      splits.forEach((split: Split) => {
        if (splitTotal == 0) {
          split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(2);
        } else {
          split.allocatedAmount = +(
            +split.assignedAmount +
            +split.allocatedAmount +
            (+split.assignedAmount / splitTotal) * allocatedAmount
          ).toFixed(2);
        }
      });
      if (!this.expenseFullyAllocated() && splitCount > 0) {
        let diff = +(totalAmount - this.getAllocatedTotal()).toFixed(2);
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

  onSubmit(): void {
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
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.editExpenseForm.disable();
        const val = this.editExpenseForm.value;
        const expenseDate = firestore.Timestamp.fromDate(val.date);
        const changes: Partial<Expense> = {
          date: expenseDate,
          description: val.description,
          categoryId: val.categoryId,
          paidByMemberId: val.paidByMemberId,
          sharedAmount: +val.sharedAmount,
          allocatedAmount: +val.allocatedAmount,
          totalAmount: +val.amount,
          hasReceipt: this.expense().hasReceipt || !!this.fileName(),
        };
        let splits: Partial<Split>[] = [];
        this.splitsFormArray.value.forEach((s) => {
          const split: Partial<Split> = {
            date: expenseDate,
            categoryId: val.categoryId,
            assignedAmount: +s.assignedAmount,
            allocatedAmount: +s.allocatedAmount,
            paidByMemberId: val.paidByMemberId,
            owedByMemberId: s.owedByMemberId,
            paid: s.owedByMemberId == val.paidByMemberId,
          };
          splits.push(split);
        });
        this.expenseService
          .updateExpense(
            this.#currentGroup().id,
            this.expense().id,
            changes,
            splits
          )
          .then(() => {
            if (this.receiptFile()) {
              const fileRef = ref(
                this.storage,
                `groups/${this.#currentGroup().id}/receipts/${this.expense().id}`
              );
              uploadBytes(fileRef, this.receiptFile()).then(() => {
                logEvent(this.analytics, 'receipt_uploaded');
              });
            }
            this.snackBar.open('Expense updated successfully.', 'OK');
            this.router.navigate(['/expenses']);
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'edit_expense',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not edit expense.',
              'Close'
            );
            this.editExpenseForm.enable();
          })
          .finally(() => this.loading.loadingOff());
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
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.expenseService
          .deleteExpense(this.#currentGroup().id, this.expense().id)
          .then(() => {
            if (this.receiptUrl()) {
              const fileRef = ref(
                this.storage,
                `groups/${this.#currentGroup().id}/receipts/${this.expense().id}`
              );
              deleteObject(fileRef);
            }
            this.snackBar.open('Expense deleted.', 'OK');
            this.router.navigate(['/expenses']);
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_expense',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not delete expense.',
              'Close'
            );
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/expenses']);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(AddEditExpenseHelpComponent, dialogConfig);
  }
}
