import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { ref, Storage, uploadBytes } from '@angular/fire/storage';
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
import { LoadingService } from '@shared/loading/loading.service';
import * as firestore from 'firebase/firestore';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
  Signal,
} from '@angular/core';
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
  MatDialogActions,
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

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
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
export class AddExpenseComponent implements OnInit {
  dialogRef = inject(MatDialogRef<AddExpenseComponent>);
  fb = inject(FormBuilder);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  storage = inject(Storage);
  analytics = inject(Analytics);
  data: any = inject(MAT_DIALOG_DATA);

  categories: Signal<Category[]> = this.categoryService.activeCategories;
  members: Signal<Member[]> = this.memberService.activeGroupMembers;
  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  currentGroup: Signal<Group> = this.groupService.currentGroup;

  fileName: string;
  receiptFile: File;
  fromMemorized: boolean = false;
  addExpenseForm: FormGroup;
  splitsDataSource: Split[] = [];
  columnsToDisplay: string[] = ['memberId', 'assigned', 'allocated', 'delete'];
  splitForm: FormArray;

  @ViewChild('splitsTable') splitsTable: MatTable<Split>;
  @ViewChild('datePicker') datePicker: ElementRef;

  constructor() {
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
        paidByMemberId: [this.currentMember().id, Validators.required],
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
    if (this.categories().length == 1) {
      this.addExpenseForm.patchValue({
        categoryId: this.categories()[0].id,
      });
    }
    if (this.data.memorized) {
      this.splitsDataSource = this.data.expense.splits;
      this.updateForm();
    } else {
      this.addAllActiveGroupMembers();
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

  removeFile(): void {
    this.receiptFile = null;
    this.fileName = '';
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

  addAllActiveGroupMembers(): void {
    if (this.splitsDataSource.length > 0) {
      this.saveSplitsData();
    }
    this.members().forEach((member) => {
      const existingSplits = this.splitsDataSource.map((s) => s.owedByMemberId);
      if (!existingSplits.includes(member.id)) {
        this.splitsDataSource.push(
          new Split({
            owedByMemberId: member.id,
            assignedAmount: 0,
            allocatedAmount: 0,
          })
        );
      }
    });
    this.updateForm();
    this.splitsTable?.renderRows();
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
    const expenseDate = firestore.Timestamp.fromDate(val.date);
    const expense: Partial<Expense> = {
      date: expenseDate,
      description: val.description,
      categoryId: val.categoryId,
      paidByMemberId: val.paidByMemberId,
      sharedAmount: val.sharedAmount,
      allocatedAmount: val.allocatedAmount,
      totalAmount: val.amount,
      hasReceipt: !!this.fileName,
    };
    let splits: Partial<Split>[] = [];
    this.splitsDataSource.forEach((s) => {
      const split: Partial<Split> = {
        date: expenseDate,
        groupId: this.currentGroup().id,
        categoryId: val.categoryId,
        assignedAmount: s.assignedAmount,
        allocatedAmount: s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
        paid: s.owedByMemberId == val.paidByMemberId,
      };
      splits.push(split);
    });
    this.loading.loadingOn();
    this.expenseService
      .addExpense(this.currentGroup().id, expense, splits)
      .then((expenseId: string) => {
        if (this.receiptFile) {
          const fileRef = ref(
            this.storage,
            `groups/${this.currentGroup().id}/receipts/${expenseId}`
          );
          uploadBytes(fileRef, this.receiptFile).then(() => {
            logEvent(this.analytics, 'receipt_uploaded');
          });
        }
        this.dialogRef.close({ success: true, operation: 'added' });
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_expense',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not save expense.',
          'Close'
        );
        this.addExpenseForm.enable();
      })
      .finally(() => this.loading.loadingOff());
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
        groupId: this.currentGroup().id,
        categoryId: val.categoryId,
        assignedAmount: s.assignedAmount,
        allocatedAmount: s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
        paid: false,
      };
      splits.push(split);
    });
    this.loading.loadingOn();
    this.expenseService
      .addExpense(this.currentGroup().id, expense, splits, true)
      .then(() => {
        this.dialogRef.close({
          success: true,
          operation: 'memorized',
        });
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'memorize_expense',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not memorize expense.',
          'Close'
        );
        this.addExpenseForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
