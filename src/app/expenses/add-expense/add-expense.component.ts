import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable } from '@angular/material/table';
import { Category } from '@models/category';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemberService } from '@services/member.service';
import { Observable } from 'rxjs';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';

export class SplitInProgress {
  constructor(init?: Partial<SplitInProgress>) {
    Object.assign(this, init);
  }
  memberId: string = '';
  assigned: number = 0;
  allocated: number = 0;
}

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
  addExpenseForm: FormGroup;
  splitsDataSource: SplitInProgress[] = [];
  columnsToDisplay: string[] = [
    'memberId',
    'assigned',
    'allocated',
    'save',
    'delete',
  ];
  splitForm: FormArray;

  @ViewChild(MatTable) splitsTable: MatTable<SplitInProgress>;

  constructor(
    private dialogRef: MatDialogRef<AddExpenseComponent>,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private memberService: MemberService,
    private expenseService: ExpenseService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.groupId = this.data.groupId;
    this.currentMember = this.data.member;
    this.isGroupAdmin = this.data.isGroupAdmin;
    this.addExpenseForm = this.fb.group({
      paidByMemberId: [this.currentMember.id, Validators.required],
      date: [new Date(), Validators.required],
      amount: [0.0, Validators.required],
      description: ['', Validators.required],
      categoryId: ['', Validators.required],
      sharedAmount: [0.0],
      allocatedAmount: [0.0],
    });
  }

  ngOnInit(): void {
    this.members$ = this.memberService.getAllGroupMembers(this.groupId);
    this.categories$ = this.categoryService.getCategoriesForGroup(this.groupId);
  }

  public get e() {
    return this.addExpenseForm.controls;
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
            memberId: new FormControl(x.memberId),
            assigned: new FormControl(x.assigned),
          })
      )
    );
  }

  addRow(): void {
    this.saveSplitsData();
    this.splitsDataSource.push(new SplitInProgress());
    this.updateForm();
    this.splitsTable.renderRows();
  }

  saveSplitsData(): void {
    for (let i = 0; i < this.splitForm.controls.length; i++) {
      const split = this.splitForm.controls[i].value;
      this.splitsDataSource[i] = new SplitInProgress({
        memberId: split.memberId,
        assigned: split.assigned,
        allocated: 0,
      });
    }
  }

  deleteRow(index: number): void {
    this.saveSplitsData();
    this.splitsDataSource.splice(index, 1);
    this.updateForm();
    this.splitsTable.renderRows();
  }

  allocateSharedAmounts(): void {
    this.saveSplitsData();
  }

  getSplitTotal(): number {
    let total = 0;
    this.splitsDataSource.forEach((split) => {
      total += split.allocated;
    });
    return total;
  }

  expenseFullyAllocated = (): boolean =>
    this.addExpenseForm.value.amount == this.getSplitTotal();

  onSelectMember(e: MatSelectChange) {}

  onSubmit(): void {}

  close(): void {
    this.dialogRef.close(false);
  }
}
