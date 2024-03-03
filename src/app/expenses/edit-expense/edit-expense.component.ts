import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable } from '@angular/material/table';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import * as firestore from 'firebase/firestore';
import { Url } from 'url';
import {
  catchError,
  NotFoundError,
  Observable,
  of,
  tap,
  throwError,
} from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-edit-expense',
  templateUrl: './edit-expense.component.html',
  styleUrl: './edit-expense.component.scss',
})
export class EditExpenseComponent implements OnInit {
  members$: Observable<Member[]>;
  categories$: Observable<Category[]>;
  groupId: string;
  currentMember: Member;
  isGroupAdmin: boolean = false;
  fileName: string;
  receiptFile: File;
  receiptUrl: Url;
  fromMemorized: boolean = false;
  editExpenseForm: FormGroup;
  splitsDataSource: Split[] = [];
  columnsToDisplay: string[] = ['memberId', 'assigned', 'allocated', 'delete'];
  splitForm: FormArray;

  @ViewChild(MatTable) splitsTable: MatTable<Split>;

  constructor(
    private dialogRef: MatDialogRef<EditExpenseComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private memberService: MemberService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private storage: AngularFireStorage,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.groupId = this.data.groupId;
    this.currentMember = this.data.member;
    this.isGroupAdmin = this.data.isGroupAdmin;
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
    this.splitsDataSource = data.expense.splits;
    this.updateForm();
  }

  ngOnInit(): void {
    this.members$ = this.memberService.getAllGroupMembers(this.groupId);
    this.categories$ = this.categoryService.getCategoriesForGroup(this.groupId);
    const url = `groups/${this.groupId}/receipts/${this.data.expense.id}`;
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

  getSplitControl(index: number, controlName: string): FormControl {
    return (this.splitForm.at(index) as FormGroup).get(
      controlName
    ) as FormControl;
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource.map(
        (x: any) =>
          new FormGroup({
            owedByMemberId: new FormControl(x.owedByMemberId),
            assignedAmount: new FormControl(x.assignedAmount),
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
    this.splitsDataSource.push(new Split());
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
      const sharedAmount: number = val.sharedAmount;
      const allocatedAmount: number = val.allocatedAmount;
      if (
        totalAmount == +(sharedAmount + allocatedAmount + splitTotal).toFixed(2)
      ) {
        this.splitsDataSource.forEach((split) => {
          if (split.owedByMemberId != '') {
            split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
          }
        });
        this.splitsDataSource.forEach((split) => {
          if (split.owedByMemberId != '') {
            if (splitTotal == 0) {
              split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(
                2
              );
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
      } else {
        this.snackBar.open(
          'Sum of evenly shared amount, proportional amount, and all member amounts must equal the total amount before allocating.',
          'OK'
        );
      }
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
          groupId: this.groupId,
          categoryId: val.categoryId,
          assignedAmount: s.assignedAmount,
          allocatedAmount: s.allocatedAmount,
          paidByMemberId: val.paidByMemberId,
          owedByMemberId: s.owedByMemberId,
        };
        splits.push(split);
      });
      this.expenseService
        .updateMemorizedExpense(
          this.groupId,
          this.data.expense.id,
          changes,
          splits
        )
        .pipe(
          tap(() => {
            this.dialogRef.close({
              success: true,
              operation: 'edited',
            });
          }),
          catchError((err: Error) => {
            this.snackBar.open(
              'Something went wrong - could not update memorized expense.',
              'Close'
            );
            this.editExpenseForm.enable();
            return throwError(() => new Error(err.message));
          })
        )
        .subscribe();
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
          this.editExpenseForm.disable();
          const val = this.editExpenseForm.value;
          const changes: Partial<Expense> = {
            date: firestore.Timestamp.fromDate(val.date),
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
              groupId: this.groupId,
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
            .updateExpense(this.groupId, this.data.expense.id, changes, splits)
            .pipe(
              tap(() => {
                if (this.receiptFile) {
                  const filePath = `groups/${this.groupId}/receipts/${this.data.expense.id}`;
                  const upload = this.storage.upload(
                    filePath,
                    this.receiptFile
                  );
                  upload.snapshotChanges().subscribe();
                }
                this.dialogRef.close({
                  success: true,
                  operation: 'edited',
                });
              }),
              catchError((err: Error) => {
                this.snackBar.open(
                  'Something went wrong - could not edit expense.',
                  'Close'
                );
                this.editExpenseForm.enable();
                return throwError(() => new Error(err.message));
              })
            )
            .subscribe();
        }
      });
    }
  }

  delete(): void {
    if (this.fromMemorized) {
      const dialogConfig: MatDialogConfig = {
        data: `this memorized expense`,
      };
      const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((confirm) => {
        if (confirm) {
          this.expenseService
            .deleteMemorizedExpense(this.groupId, this.data.expense.id)
            .pipe(
              tap(() => {
                if (this.receiptUrl) {
                  this.storage
                    .ref(
                      `groups/${this.groupId}/receipts/${this.data.expense.id}`
                    )
                    .delete();
                }
                this.dialogRef.close({
                  success: true,
                  operation: 'deleted',
                });
              }),
              catchError((err: Error) => {
                this.snackBar.open(
                  'Something went wrong - could not delete memorized expense.',
                  'Close'
                );
                return throwError(() => new Error(err.message));
              })
            )
            .subscribe();
        }
      });
    } else {
      const dialogConfig: MatDialogConfig = {
        data: `this expense`,
      };
      const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((confirm) => {
        if (confirm) {
          this.expenseService
            .deleteExpense(this.groupId, this.data.expense.id)
            .pipe(
              tap(() => {
                if (this.receiptUrl) {
                  this.storage
                    .ref(
                      `groups/${this.groupId}/receipts/${this.data.expense.id}`
                    )
                    .delete();
                }
                this.dialogRef.close({
                  success: true,
                  operation: 'deleted',
                });
              }),
              catchError((err: Error) => {
                this.snackBar.open(
                  'Something went wrong - could not delete expense.',
                  'Close'
                );
                return throwError(() => new Error(err.message));
              })
            )
            .subscribe();
        }
      });
    }
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
