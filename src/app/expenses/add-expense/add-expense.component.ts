import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { MatDatepicker } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable } from '@angular/material/table';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';
import * as firestore from 'firebase/firestore';
import moment from 'moment';
import { catchError, map, Observable, share, tap, throwError } from 'rxjs';
import {
  Component,
  ElementRef,
  Inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
})
export class AddExpenseComponent implements OnInit {
  members$: Observable<Member[]>;
  categories$: Observable<Category[]>;
  groupId: string;
  currentMember: Member;
  isGroupAdmin: boolean = false;
  fileName: string;
  receiptFile: File;
  newExpenseId: string;
  fromMemorized: boolean = false;
  addExpenseForm: FormGroup;
  splitsDataSource: Split[] = [];
  columnsToDisplay: string[] = ['memberId', 'assigned', 'allocated', 'delete'];
  splitForm: FormArray;

  @ViewChild(MatTable) splitsTable: MatTable<Split>;
  @ViewChild('datePicker') datePicker: ElementRef;

  constructor(
    private dialogRef: MatDialogRef<AddExpenseComponent>,
    private fb: FormBuilder,
    private memberService: MemberService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private db: AngularFirestore,
    private storage: AngularFireStorage,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.groupId = this.data.groupId;
    this.currentMember = this.data.member;
    this.isGroupAdmin = this.data.isGroupAdmin;
    if (this.data.memorized) {
      this.fromMemorized = true;
      const expense: Expense = this.data.expense;
      this.addExpenseForm = this.fb.group({
        paidByMemberId: [expense.paidByMemberId, Validators.required],
        date: [new Date(), Validators.required],
        amount: [expense.totalAmount, Validators.required],
        description: [expense.description, Validators.required],
        categoryId: [expense.categoryId, Validators.required],
        sharedAmount: [expense.sharedAmount, Validators.required],
        allocatedAmount: [expense.allocatedAmount, Validators.required],
      });
    } else {
      this.addExpenseForm = this.fb.group({
        paidByMemberId: [this.currentMember.id, Validators.required],
        date: [new Date(), Validators.required],
        amount: [0.0, Validators.required],
        description: ['', Validators.required],
        categoryId: ['', Validators.required],
        sharedAmount: [0.0, Validators.required],
        allocatedAmount: [0.0, Validators.required],
      });
    }
  }

  ngOnInit(): void {
    this.members$ = this.memberService.getActiveGroupMembers(this.groupId);
    this.categories$ = this.categoryService.getActiveCategoriesForGroup(
      this.groupId
    );
    this.categories$
      .pipe(
        map((categories) => {
          if (categories.length == 1) {
            this.addExpenseForm.patchValue({
              categoryId: categories[0].id,
            });
          }
        })
      )
      .subscribe();
    this.newExpenseId = this.db.createId();
    if (this.data.memorized) {
      this.splitsDataSource = this.data.expense.splits;
      this.updateForm();
    }
  }

  public get e() {
    return this.addExpenseForm.controls;
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
        (x: Split) =>
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
    this.splitsDataSource.push(new Split({ assignedAmount: 0 }));
    this.updateForm();
    this.splitsTable.renderRows();
  }

  addAllActiveGroupMembers(): void {
    if (this.splitsDataSource.length > 0) {
      this.saveSplitsData();
    }
    this.members$
      .pipe(
        map((members) => {
          members.forEach((member) => {
            this.splitsDataSource.push(
              new Split({
                owedByMemberId: member.id,
                assignedAmount: 0,
              })
            );
          });
          this.updateForm();
          this.splitsTable.renderRows();
        })
      )
      .subscribe();
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
      const val = this.addExpenseForm.value;
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
        this.addExpenseForm.patchValue({
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

  onCalendarKeyPress(e: KeyboardEvent) {
    if (['-', '+'].includes(e.key)) {
      const currentDate = new Date(this.datePicker.nativeElement.value);
      if (currentDate.toString() !== 'Invalid Date') {
        if (e.key === '-') {
          const newDate = currentDate.setDate(currentDate.getDate() - 1);
          this.addExpenseForm.patchValue({
            date: new Date(newDate),
          });
        } else if (e.key === '+') {
          const newDate = currentDate.setDate(currentDate.getDate() + 1);
          this.addExpenseForm.patchValue({
            date: new Date(newDate),
          });
        }
      } else {
        this.addExpenseForm.patchValue({
          date: new Date(),
        });
      }
      e.preventDefault();
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
    this.addExpenseForm.value.amount == this.getAllocatedTotal();

  onSubmit(): void {
    this.addExpenseForm.disable();
    const val = this.addExpenseForm.value;
    const expense: Partial<Expense> = {
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
        expenseId: this.newExpenseId,
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
      .addExpense(this.groupId, this.newExpenseId, expense, splits)
      .pipe(
        tap(() => {
          if (this.receiptFile) {
            const filePath = `groups/${this.groupId}/receipts/${this.newExpenseId}`;
            const upload = this.storage.upload(filePath, this.receiptFile);
            upload.snapshotChanges().subscribe();
          }
          this.dialogRef.close({ success: true, operation: 'added' });
        }),
        catchError((err: Error) => {
          console.log(err.message);
          this.snackBar.open(
            'Something went wrong - could not add expense.',
            'Close'
          );
          this.addExpenseForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  memorize(): void {
    this.addExpenseForm.disable();
    const val = this.addExpenseForm.value;
    const expense: Partial<Expense> = {
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
        expenseId: this.newExpenseId,
        categoryId: val.categoryId,
        assignedAmount: s.assignedAmount,
        allocatedAmount: s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
        paid: false,
      };
      splits.push(split);
    });
    this.expenseService
      .memorizeExpense(this.groupId, this.newExpenseId, expense, splits)
      .pipe(
        tap(() => {
          this.dialogRef.close({
            success: true,
            operation: 'memorized',
          });
        }),
        catchError((err: Error) => {
          console.log(err.message);
          this.snackBar.open(
            'Something went wrong - could not memorize expense.',
            'Close'
          );
          this.addExpenseForm.enable();
          return throwError(() => new Error(err.message));
        })
      )
      .subscribe();
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
