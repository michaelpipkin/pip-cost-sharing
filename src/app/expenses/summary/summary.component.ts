import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable } from '@angular/material/table';
import { Router } from '@angular/router';
import { AmountDue } from '@models/amount-due';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
import { catchError, map, Observable, tap, throwError } from 'rxjs';

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
})
export class SummaryComponent implements OnInit {
  currentUser: firebase.User;
  currentGroup: Group;
  currentMember: Member;
  members$: Observable<Member[]>;
  members: Member[];
  splits$: Observable<Split[]>;
  selectedMemberId: string = '';
  tableData: AmountDue[] = [];
  columnsToDisplay: string[] = ['owedTo', 'owedBy', 'amount', 'markPaid'];

  @ViewChild(MatTable) table: MatTable<AmountDue>;

  constructor(
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private memberService: MemberService,
    private expenseService: ExpenseService,
    private splitService: SplitService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private loading: LoadingService
  ) {}

  ngOnInit(): void {
    if (this.groupService.getCurrentGroup() == null) {
      this.router.navigateByUrl('/groups');
    } else {
      this.currentUser = this.userService.getCurrentUser();
      this.currentGroup = this.groupService.getCurrentGroup();
      this.currentMember = this.memberService.getCurrentGroupMember();
      this.members$ = this.memberService
        .getAllGroupMembers(this.currentGroup.id)
        .pipe(
          tap((members) => {
            this.members = members;
          })
        );
      this.tableData = [];
      this.selectedMemberId = '';
      this.loadUnpaidSplits();
    }
  }

  loadUnpaidSplits(): void {
    this.splits$ = this.splitService.getUnpaidSplitsForGroup(
      this.currentGroup.id
    );
  }

  getMemberName(memberId: string): string {
    const member = this.members.find((m) => m.id === memberId);
    return !!member ? member.displayName : '';
  }

  onSelectMember(e: MatSelectChange) {
    this.loading.loadingOn();
    this.splits$
      .pipe(
        map((splits) => {
          this.tableData = [];
          const memberSplits = splits.filter(
            (s) =>
              s.owedByMemberId == this.selectedMemberId ||
              s.paidByMemberId == this.selectedMemberId
          );
          this.members
            .filter((m) => m.id != this.selectedMemberId)
            .forEach((member) => {
              const owedToSelected = memberSplits
                .filter((m) => m.owedByMemberId == member.id)
                .reduce((total, split) => (total += split.allocatedAmount), 0);
              const owedBySelected = memberSplits
                .filter((m) => m.paidByMemberId == member.id)
                .reduce((total, split) => (total += split.allocatedAmount), 0);
              if (owedToSelected > owedBySelected) {
                this.tableData.push(
                  new AmountDue({
                    owedByMemberId: member.id,
                    owedToMemberId: this.selectedMemberId,
                    amount: owedToSelected - owedBySelected,
                  })
                );
              } else if (owedBySelected > owedToSelected) {
                this.tableData.push(
                  new AmountDue({
                    owedToMemberId: member.id,
                    owedByMemberId: this.selectedMemberId,
                    amount: owedBySelected - owedToSelected,
                  })
                );
              }
            });
          this.table.renderRows();
        }),

        tap(() => {
          this.loading.loadingOff();
        })
      )
      .subscribe();
  }

  markExpensesPaid(owedToMemberId: string, owedByMemberId: string): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Confirm Action',
        confirmationText:
          'Are you sure you want to mark expenses between these members paid?',
        cancelButtonText: 'No',
        confirmButtonText: 'Yes',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.splitService
          .paySplitsBetweenMembers(
            this.currentGroup.id,
            owedToMemberId,
            owedByMemberId
          )
          .pipe(
            tap(() => {
              this.snackBar.open('Expenses have been marked paid.', 'OK');
              this.table.renderRows();
            }),
            catchError((err: Error) => {
              console.log(err.message);
              this.snackBar.open(
                'Something went wrong - could not mark expenses paid.',
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
