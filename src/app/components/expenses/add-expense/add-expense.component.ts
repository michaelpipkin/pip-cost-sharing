import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { ref, Storage, uploadBytes } from '@angular/fire/storage';
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
import { LoadingService } from '@shared/loading/loading.service';
import * as firestore from 'firebase/firestore';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import stringMath from 'string-math';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  ViewChild,
  Signal,
  model,
  ViewChildren,
  QueryList,
  afterRender,
} from '@angular/core';
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
export class AddExpenseComponent implements OnInit {
  dialogRef = inject(MatDialogRef<AddExpenseComponent>);
  dialog = inject(MatDialog);
  fb = inject(FormBuilder);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  expenseService = inject(ExpenseService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  storage = inject(Storage);
  analytics = inject(Analytics);
  stringUtils = inject(StringUtils);
  data: any = inject(MAT_DIALOG_DATA);

  categories: Signal<Category[]> = this.categoryService.activeCategories;
  members: Signal<Member[]> = this.memberService.activeGroupMembers;
  currentMember: Signal<Member> = this.memberService.currentGroupMember;
  currentGroup: Signal<Group> = this.groupService.currentGroup;

  addExpenseForm: FormGroup;
  splitForm: FormArray;

  fileName = model<string>('');
  receiptFile = model<File>(null);
  splitsDataSource = model<Split[]>([]);

  @ViewChild('splitsTable') splitsTable: MatTable<Split>;
  @ViewChild('datePicker') datePicker: ElementRef;
  @ViewChildren('inputElement') inputElements!: QueryList<ElementRef>;

  constructor() {
    if (this.data.memorized) {
      const expense: Expense = this.data.expense;
      this.addExpenseForm = this.fb.group({
        paidByMemberId: [expense.paidByMemberId, Validators.required],
        date: [new Date(), Validators.required],
        amount: [
          expense.totalAmount,
          [Validators.required, this.amountValidator()],
        ],
        description: [expense.description, Validators.required],
        categoryId: [expense.categoryId, Validators.required],
        sharedAmount: [expense.sharedAmount, Validators.required],
        allocatedAmount: [expense.allocatedAmount, Validators.required],
      });
    } else {
      this.addExpenseForm = this.fb.group({
        paidByMemberId: [this.currentMember().id, Validators.required],
        date: [new Date(), Validators.required],
        amount: ['0.00', [Validators.required, this.amountValidator()]],
        description: ['', Validators.required],
        categoryId: ['', Validators.required],
        sharedAmount: [0.0, Validators.required],
        allocatedAmount: ['0.00', Validators.required],
      });
    }
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    if (this.categories().length == 1) {
      this.addExpenseForm.patchValue({
        categoryId: this.categories()[0].id,
      });
    }
    if (this.data.memorized) {
      this.splitsDataSource.set(this.data.expense.splits);
      this.updateForm();
    } else {
      this.addAllActiveGroupMembers();
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
    return this.addExpenseForm.controls;
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

  deleteRow(index: number): void {
    this.splitForm.controls.splice(index, 1);
    this.saveSplitsData();
    this.updateForm();
    this.splitsTable.renderRows();
  }

  addAllActiveGroupMembers(): void {
    this.members().forEach((member) => {
      const existingSplits = this.splitsDataSource().map(
        (s) => s.owedByMemberId
      );
      if (!existingSplits.includes(member.id)) {
        this.splitsDataSource.update((ds) => [
          ...ds,
          new Split({
            owedByMemberId: member.id,
            assignedAmount: 0,
            allocatedAmount: 0,
          }),
        ]);
      }
    });
    this.updateForm();
    this.saveSplitsData();
    this.splitsTable?.renderRows();
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
      const val = this.addExpenseForm.value;
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
        this.addExpenseForm.patchValue({
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
    this.addExpenseForm.value.amount == this.getAllocatedTotal();

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
      hasReceipt: !!this.fileName(),
    };
    let splits: Partial<Split>[] = [];
    this.splitsDataSource().forEach((s: Split) => {
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
        if (this.receiptFile()) {
          const fileRef = ref(
            this.storage,
            `groups/${this.currentGroup().id}/receipts/${expenseId}`
          );
          uploadBytes(fileRef, this.receiptFile()).then(() => {
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
    this.splitsDataSource().forEach((s: Split) => {
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