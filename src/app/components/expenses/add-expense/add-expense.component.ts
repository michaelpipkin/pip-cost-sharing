import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { ref, Storage, uploadBytes } from '@angular/fire/storage';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
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
import { MemorizedService } from '@services/memorized.service';
import { DatePlusMinusDirective } from '@shared/directives/date-plus-minus.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import * as firestore from 'firebase/firestore';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  Signal,
  model,
  afterRender,
  viewChild,
  viewChildren,
  computed,
  afterNextRender,
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
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatIconModule,
    CurrencyPipe,
    DecimalPipe,
    FormatCurrencyInputDirective,
    DatePlusMinusDirective,
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
  memorizedService = inject(MemorizedService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  storage = inject(Storage);
  analytics = inject(Analytics);
  decimalPipe = inject(DecimalPipe);
  stringUtils = inject(StringUtils);
  data: any = inject(MAT_DIALOG_DATA);

  currentMember: Signal<Member> = this.memberService.currentMember;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;
  #categories: Signal<Category[]> = this.categoryService.groupCategories;

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  fileName = model<string>('');
  receiptFile = model<File>(null);
  splitsDataSource = model<Split[]>([]);

  addExpenseForm: FormGroup;
  splitForm: FormArray;

  splitsTable = viewChild<MatTable<Split>>('splitsTable');
  datePicker = viewChild<ElementRef>('datePicker');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');

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
        amount: [0, [Validators.required, this.amountValidator()]],
        description: ['', Validators.required],
        categoryId: ['', Validators.required],
        sharedAmount: [0.0, Validators.required],
        allocatedAmount: [0, Validators.required],
      });
    }
    afterNextRender(() => {
      if (this.data.memorized) {
        this.totalAmountField().nativeElement.value =
          this.decimalPipe.transform(this.data.expense.totalAmount, '1.2-2') ||
          '0.00';
        this.allocatedAmountField().nativeElement.value =
          this.decimalPipe.transform(
            this.data.expense.allocatedAmount,
            '1.2-2'
          ) || '0.00';
      } else {
        this.totalAmountField().nativeElement.value = '0.00';
        this.allocatedAmountField().nativeElement.value = '0.00';
      }
    });
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    if (this.activeCategories().length == 1) {
      this.addExpenseForm.patchValue({
        categoryId: this.activeCategories()[0].id,
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
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
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
        title: 'Add/Edit Expense Help',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  getSplitControl(index: number, controlName: string): FormControl {
    return (this.splitForm.at(index) as FormGroup).get(
      controlName
    ) as FormControl;
  }

  saveValue(e: HTMLInputElement, control: string = ''): void {
    this.addExpenseForm.patchValue({
      [control]: +e.value,
    });
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource().map(
        (x: Split) =>
          new FormGroup({
            owedByMemberId: new FormControl(x.owedByMemberId),
            assignedAmount: new FormControl(
              this.decimalPipe.transform(x.assignedAmount, '1.2-2') || '0.00'
            ),
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
        this.addExpenseForm.markAsDirty();
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
  }

  deleteRow(index: number): void {
    this.splitForm.controls.splice(index, 1);
    this.saveSplitsData();
    this.updateForm();
  }

  addAllActiveGroupMembers(): void {
    this.activeMembers().forEach((member: Member) => {
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
      if (!this.expenseFullyAllocated() && splitCount > 0) {
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
}
