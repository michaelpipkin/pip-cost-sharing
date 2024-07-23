import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatMiniFabButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { HelpComponent } from '@components/help/help.component';
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
import { LoadingService } from '@shared/loading/loading.service';
import { FirebaseError } from 'firebase/app';
import * as firestore from 'firebase/firestore';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import stringMath from 'string-math';
import { Url } from 'url';
import {
  deleteObject,
  getDownloadURL,
  ref,
  Storage,
  uploadBytes,
} from '@angular/fire/storage';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatPrefix,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatNoDataRow,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
  Signal,
  model,
  ViewChildren,
  QueryList,
  afterRender,
} from '@angular/core';

@Component({
  selector: 'app-edit-expense',
  templateUrl: './edit-expense.component.html',
  styleUrl: './edit-expense.component.scss',
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
    CommonModule,
    MatError,
    MatInput,
    MatTooltip,
    MatDatepickerInput,
    MatHint,
    MatDatepickerToggle,
    MatSuffix,
    MatDatepicker,
    MatPrefix,
    MatMiniFabButton,
    MatIcon,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    MatDialogActions,
    AsyncPipe,
    CurrencyPipe,
  ],
})
export class EditExpenseComponent implements OnInit {
  dialogRef = inject(MatDialogRef<EditExpenseComponent>);
  fb = inject(FormBuilder);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  storage = inject(Storage);
  analytics = inject(Analytics);
  stringUtils = inject(StringUtils);
  data: any = inject(MAT_DIALOG_DATA);

  categories = signal<Category[]>([]);
  expenseMembers = signal<Member[]>([]);
  splitMembers = signal<Member[]>([]);

  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  allGroupMembers: Signal<Member[]> = this.memberService.allGroupMembers;
  allCategories: Signal<Category[]> = this.categoryService.allCategories;

  editExpenseForm: FormGroup;
  splitForm: FormArray;

  private fromMemorized: boolean = false;
  private hasReceipt: boolean;

  fileName = model<string>('');
  receiptFile = model<File>(null);
  receiptUrl = model<Url>(null);
  splitsDataSource = model<Split[]>([]);

  @ViewChild('splitsTable') splitsTable: MatTable<Split>;
  @ViewChild('datePicker') datePicker: ElementRef;
  @ViewChildren('inputElement') inputElements!: QueryList<ElementRef>;

  constructor() {
    const expense: Expense = this.data.expense;
    this.hasReceipt = expense.hasReceipt;
    this.fromMemorized = this.data.memorized;
    this.editExpenseForm = this.fb.group({
      paidByMemberId: [expense.paidByMemberId, Validators.required],
      date: [new Date(), Validators.required],
      amount: [
        expense.totalAmount.toFixed(2),
        [Validators.required, this.amountValidator()],
      ],
      description: [expense.description, Validators.required],
      categoryId: [expense.categoryId, Validators.required],
      sharedAmount: [expense.sharedAmount, Validators.required],
      allocatedAmount: [
        expense.allocatedAmount.toFixed(2),
        Validators.required,
      ],
    });
    if (!this.fromMemorized) {
      this.editExpenseForm.patchValue({
        date: expense.date.toDate(),
      });
    }
    let splits: Split[] = [];
    this.data.expense.splits.forEach((split) => {
      splits.push(new Split({ ...split }));
    });
    this.splitsDataSource.set(splits);
    this.updateForm();
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    this.expenseMembers.set(
      this.allGroupMembers().filter(
        (m) => m.active || m.id == this.data.expense.paidByMemberId
      )
    );
    this.categories.set(
      this.allCategories().filter(
        (c) => c.active || c.id == this.data.expense.categoryId
      )
    );
    const splitMemberIds = this.splitsDataSource().map((s) => s.owedByMemberId);
    this.splitMembers.set(
      this.allGroupMembers().filter(
        (m) => m.active || splitMemberIds.includes(m.id)
      )
    );
    if (this.hasReceipt) {
      const storageUrl = `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`;
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
  }

  addSelectFocus(): void {
    this.inputElements.forEach((elementRef) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        this.select();
      });
    });
  }

  amountValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === 0 ? { zeroAmount: true } : null;
    };
  }

  public get e() {
    return this.editExpenseForm.controls;
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'add-edit-expense',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  onCalendarKeyPress(e: KeyboardEvent) {
    if (['-', '+'].includes(e.key)) {
      const currentDate = new Date(this.datePicker.nativeElement.value);
      if (currentDate.toString() !== 'Invalid Date') {
        if (e.key === '-') {
          const newDate = currentDate.setDate(currentDate.getDate() - 1);
          this.editExpenseForm.patchValue({
            date: new Date(newDate),
          });
        } else if (e.key === '+') {
          const newDate = currentDate.setDate(currentDate.getDate() + 1);
          this.editExpenseForm.patchValue({
            date: new Date(newDate),
          });
        }
      } else {
        this.editExpenseForm.patchValue({
          date: this.data.expense.date.toDate(),
        });
      }
      e.preventDefault();
    }
  }

  getSplitControl(index: number, controlName: string): FormControl {
    return (this.splitForm.at(index) as FormGroup).get(
      controlName
    ) as FormControl;
  }

  formatNumber(e): void {
    if (e.currentTarget.value === '') {
      e.currentTarget.value = '0.00';
    } else {
      try {
        let result = stringMath(e.currentTarget.value);
        e.currentTarget.value = result.toFixed(2);
      } catch {
        e.currentTarget.value = '0.00';
      }
    }
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource().map(
        (x: any) =>
          new FormGroup({
            owedByMemberId: new FormControl(x.owedByMemberId),
            assignedAmount: new FormControl(x.assignedAmount.toFixed(2)),
          })
      )
    );
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
      }
    }
  }

  removeFile(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
  }

  addRow(): void {
    if (this.splitsDataSource().length > 0) {
      this.saveSplitsData();
    }
    this.splitsDataSource.update((ds) => [
      ...ds,
      new Split({ assignedAmount: 0, allocatedAmount: 0 }),
    ]);
    this.updateForm();
    this.splitsTable.renderRows();
  }

  saveSplitsData(): void {
    let splits = [];
    for (let i = 0; i < this.splitForm?.controls.length; i++) {
      const split = this.splitForm.controls[i].value;
      if (split.owedByMemberId !== '') {
        splits[i] = new Split({
          owedByMemberId: split.owedByMemberId,
          assignedAmount: this.stringUtils.toNumber(split.assignedAmount),
          allocatedAmount: 0,
        });
      }
    }
    this.splitsDataSource.set(splits);
    this.allocateSharedAmounts();
  }

  deleteRow(index: number): void {
    this.splitForm.controls.splice(index, 1);
    this.saveSplitsData();
    this.updateForm();
    this.splitsTable.renderRows();
  }

  allocateSharedAmounts(): void {
    if (this.splitsDataSource().length > 0) {
      let splits = [...this.splitsDataSource()];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberId && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          i++;
        }
      }
      this.splitsDataSource.set([...splits]);
      const splitCount: number = splits.length;
      const splitTotal: number = this.getAssignedTotal();
      const val = this.editExpenseForm.value;
      const totalAmount: number = this.stringUtils.toNumber(val.amount);
      let sharedAmount: number = val.sharedAmount;
      const allocatedAmount: number = this.stringUtils.toNumber(
        val.allocatedAmount
      );
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
      splits.forEach((split) => {
        if (split.owedByMemberId != '') {
          split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
        }
      });
      splits.forEach((split) => {
        if (split.owedByMemberId != '') {
          if (splitTotal == 0) {
            split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(2);
          } else {
            split.allocatedAmount = +(
              +split.assignedAmount +
              +split.allocatedAmount +
              (+split.assignedAmount / splitTotal) * allocatedAmount
            ).toFixed(2);
          }
        }
      });
      if (!this.expenseFullyAllocated()) {
        let diff = +(totalAmount - this.getAllocatedTotal()).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff -= 0.01;
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff += 0.01;
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      this.updateForm();
      this.splitsTable?.renderRows();
    }
  }

  getAssignedTotal = (): number =>
    +this.splitsDataSource()
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +this.splitsDataSource()
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  expenseFullyAllocated = (): boolean =>
    this.editExpenseForm.value.amount == this.getAllocatedTotal();

  missingSplitMember(): boolean {
    let missing: boolean = false;
    this.splitForm?.controls.forEach((s) => {
      if (s.value.owedByMemberId === null) {
        missing = true;
      }
    });
    return missing;
  }

  onSubmit(): void {
    if (this.fromMemorized) {
      this.editExpenseForm.disable();
      const val = this.editExpenseForm.value;
      const changes: Partial<Expense> = {
        description: val.description,
        categoryId: val.categoryId,
        paidByMemberId: val.paidByMemberId,
        sharedAmount: val.sharedAmount,
        allocatedAmount: val.allocatedAmount,
        totalAmount: val.amount,
      };
      let splits: Partial<Split>[] = [];
      this.splitsDataSource().forEach((s) => {
        const split: Partial<Split> = {
          categoryId: val.categoryId,
          assignedAmount: s.assignedAmount,
          allocatedAmount: s.allocatedAmount,
          paidByMemberId: val.paidByMemberId,
          owedByMemberId: s.owedByMemberId,
        };
        splits.push(split);
      });
      this.loading.loadingOn();
      this.expenseService
        .updateExpense(
          this.currentGroup().id,
          this.data.expense.id,
          changes,
          splits,
          true
        )
        .then(() => {
          this.dialogRef.close({
            success: true,
            operation: 'edited',
          });
        })
        .catch((err: Error) => {
          logEvent(this.analytics, 'error', {
            component: this.constructor.name,
            action: 'edit_memorized_expense',
            message: err.message,
          });
          this.snackBar.open(
            'Something went wrong - could not update memorized expense.',
            'Close'
          );
          this.editExpenseForm.enable();
        })
        .finally(() => this.loading.loadingOff());
    } else {
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
            sharedAmount: val.sharedAmount,
            allocatedAmount: val.allocatedAmount,
            totalAmount: val.amount,
            hasReceipt: this.hasReceipt || !!this.fileName(),
          };
          let splits: Partial<Split>[] = [];
          this.splitsDataSource().forEach((s) => {
            const split: Partial<Split> = {
              date: expenseDate,
              categoryId: val.categoryId,
              assignedAmount: s.assignedAmount,
              allocatedAmount: s.allocatedAmount,
              paidByMemberId: val.paidByMemberId,
              owedByMemberId: s.owedByMemberId,
              paid: s.owedByMemberId == val.paidByMemberId,
            };
            splits.push(split);
          });
          this.expenseService
            .updateExpense(
              this.currentGroup().id,
              this.data.expense.id,
              changes,
              splits
            )
            .then(() => {
              if (this.receiptFile()) {
                const fileRef = ref(
                  this.storage,
                  `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`
                );
                uploadBytes(fileRef, this.receiptFile()).then(() => {
                  logEvent(this.analytics, 'receipt_uploaded');
                });
              }
              this.dialogRef.close({
                success: true,
                operation: 'edited',
              });
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
  }

  delete(): void {
    if (this.fromMemorized) {
      const dialogConfig: MatDialogConfig = {
        data: {
          operation: 'Delete',
          target: `this memorized expense`,
        },
      };
      const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((confirm) => {
        if (confirm) {
          this.loading.loadingOn();
          this.expenseService
            .deleteExpense(this.currentGroup().id, this.data.expense.id, true)
            .then(() => {
              if (this.receiptUrl()) {
                const fileRef = ref(
                  this.storage,
                  `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`
                );
                deleteObject(fileRef);
              }
              this.dialogRef.close({
                success: true,
                operation: 'deleted',
              });
            })
            .catch((err: Error) => {
              logEvent(this.analytics, 'error', {
                component: this.constructor.name,
                action: 'delete_memorized_expense',
                message: err.message,
              });
              this.snackBar.open(
                'Something went wrong - could not delete memorized expense.',
                'Close'
              );
            })
            .finally(() => this.loading.loadingOff());
        }
      });
    } else {
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
            .deleteExpense(this.currentGroup().id, this.data.expense.id)
            .then(() => {
              if (this.receiptUrl()) {
                const fileRef = ref(
                  this.storage,
                  `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`
                );
                deleteObject(fileRef);
              }
              this.dialogRef.close({
                success: true,
                operation: 'deleted',
              });
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
  }

  close(): void {
    this.dialogRef.close(false);
  }
}