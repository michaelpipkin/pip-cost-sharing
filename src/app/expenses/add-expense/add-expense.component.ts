import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';

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
  splits: Split[] = [];
  splitsDataSource = [...this.splits];
  columnsToDisplay: string[] = ['member', 'allocated', 'amount', 'delete'];
  @ViewChild(MatTable) table: MatTable<Split>;

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

  addRow(): void {
    this.splitsDataSource.push(new Split());
    this.table.renderRows();
  }

  allocateSharedAmounts(): void {}

  getSplitTotal(): number {
    let total = 0;
    this.splits.forEach((split) => {
      total += split.amount;
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
