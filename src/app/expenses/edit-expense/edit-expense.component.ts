import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { MatMiniFabButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
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
import * as firestore from 'firebase/firestore';
import { catchError, NotFoundError, of, tap, throwError } from 'rxjs';
import { Url } from 'url';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
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
  storage = inject(AngularFireStorage);
  analytics = inject(AngularFireAnalytics);
  data: any = inject(MAT_DIALOG_DATA);

  categories = signal<Category[]>([]);
  expenseMembers = signal<Member[]>([]);
  splitMembers = signal<Member[]>([]);

  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  allGroupMembers: Signal<Member[]> = this.memberService.allGroupMembers;
  allCategories: Signal<Category[]> = this.categoryService.allCategories;

  fileName: string;
  receiptFile: File;
  receiptUrl: Url;
  fromMemorized: boolean = false;
  editExpenseForm: FormGroup;
  splitsDataSource: Split[] = [];
  columnsToDisplay: string[] = ['memberId', 'assigned', 'allocated', 'delete'];
  splitForm: FormArray;

  @ViewChild('splitsTable') splitsTable: MatTable<Split>;
  @ViewChild('datePicker') datePicker: ElementRef;

  constructor() {
    const expense: Expense = this.data.expense;
    this.fromMemorized = this.data.memorized;
    this.editExpenseForm = this.fb.group({
      paidByMemberId: [expense.paidByMemberId, Validators.required],
      date: [new Date(), Validators.required],
      amount: [expense.totalAmount, Validators.required],
      description: [expense.description, Validators.required],
      categoryId: [expense.categoryId, Validators.required],
      sharedAmount: [expense.sharedAmount, Validators.required],
      allocatedAmount: [expense.allocatedAmount, Validators.required],
    });
    if (!this.fromMemorized) {
      this.editExpenseForm.patchValue({
        date: expense.date.toDate(),
      });
    }
    this.splitsDataSource = this.data.expense.splits;
    this.updateForm();
  }

  ngOnInit(): void {
    this.expenseMembers.set(
      this.allGroupMembers().filter(
        (m) => m.active || m.id == this.data.expense.paidByMemberId
      )
    );
    this.categoryService.getGroupCategories(this.currentGroup().id);
    this.categories.set(
      this.allCategories().filter(
        (c) => c.active || c.id == this.data.expense.categoryId
      )
    );
    const splitMemberIds = this.splitsDataSource.map((s) => s.owedByMemberId);
    this.splitMembers.set(
      this.allGroupMembers().filter(
        (m) => m.active || splitMemberIds.includes(m.id)
      )
    );
    const url = `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`;
    this.storage
      .ref(url)
      .getDownloadURL()
      .pipe(
        tap((url) => {
          if (!!url) {
            this.receiptUrl = url;
          }
        }),
        catchError((err: NotFoundError) => {
          return of('Receipt not found');
        })
      )
      .subscribe();
  }

  public get e() {
    return this.editExpenseForm.controls;
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
      e.currentTarget.value = e.currentTarget.valueAsNumber.toFixed(2);
    }
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource.map(
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
        this.receiptFile = file;
        this.fileName = this.receiptFile.name;
      }
    }
  }

  addRow(): void {
    if (this.splitsDataSource.length > 0) {
      this.saveSplitsData();
    }
    this.splitsDataSource.push(
      new Split({ assignedAmount: 0, allocatedAmount: 0 })
    );
    this.updateForm();
    this.splitsTable.renderRows();
  }

  saveSplitsData(): void {
    for (let i = 0; i < this.splitForm.controls.length; i++) {
      const split = this.splitForm.controls[i].value;
      if (split.owedByMemberId !== '') {
        this.splitsDataSource[i] = new Split({
          owedByMemberId: split.owedByMemberId,
          assignedAmount: +split.assignedAmount,
          allocatedAmount: 0,
        });
      }
    }
  }

  deleteRow(index: number): void {
    this.saveSplitsData();
    this.splitsDataSource.splice(index, 1);
    this.updateForm();
    this.splitsTable.renderRows();
  }

  allocateSharedAmounts(): void {
    if (this.splitsDataSource.length > 0) {
      this.saveSplitsData();
      for (let i = 0; i < this.splitsDataSource.length; ) {
        if (this.splitsDataSource[i].owedByMemberId === '') {
          this.splitsDataSource.splice(i, 1);
        } else {
          i++;
        }
      }
      const splitCount: number = this.splitsDataSource.length;
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
      this.splitsDataSource.forEach((split) => {
        if (split.owedByMemberId != '') {
          split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
        }
      });
      this.splitsDataSource.forEach((split) => {
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
            this.splitsDataSource[i].allocatedAmount += 0.01;
            diff -= 0.01;
          } else {
            this.splitsDataSource[i].allocatedAmount -= 0.01;
            diff += 0.01;
          }
          if (i < this.splitsDataSource.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      this.updateForm();
      this.splitsTable.renderRows();
    }
  }

  getAssignedTotal = (): number =>
    +this.splitsDataSource
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +this.splitsDataSource
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  expenseFullyAllocated = (): boolean =>
    this.editExpenseForm.value.amount == this.getAllocatedTotal();

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
      this.splitsDataSource.forEach((s) => {
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
          this.analytics.logEvent('error', {
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
          };
          let splits: Partial<Split>[] = [];
          this.splitsDataSource.forEach((s) => {
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
              if (this.receiptFile) {
                const filePath = `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`;
                const upload = this.storage.upload(filePath, this.receiptFile);
                upload.snapshotChanges().subscribe();
              }
              this.dialogRef.close({
                success: true,
                operation: 'edited',
              });
            })
            .catch((err: Error) => {
              this.analytics.logEvent('error', {
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
              if (this.receiptUrl) {
                this.storage
                  .ref(
                    `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`
                  )
                  .delete();
              }
              this.dialogRef.close({
                success: true,
                operation: 'deleted',
              });
            })
            .catch((err: Error) => {
              this.analytics.logEvent('error', {
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
              if (this.receiptUrl) {
                this.storage
                  .ref(
                    `groups/${this.currentGroup().id}/receipts/${this.data.expense.id}`
                  )
                  .delete();
              }
              this.dialogRef.close({
                success: true,
                operation: 'deleted',
              });
            })
            .catch((err: Error) => {
              this.analytics.logEvent('error', {
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
