import { AsyncPipe, CommonModule, CurrencyPipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AngularFireAnalytics } from '@angular/fire/compat/analytics';
import { FormsModule } from '@angular/forms';
import { MatIconButton, MatMiniFabButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AmountDue } from '@models/amount-due';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import firebase from 'firebase/compat/app';
import { catchError, concatMap, map, Observable, tap, throwError } from 'rxjs';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import {
  MatFormField,
  MatHint,
  MatLabel,
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
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatSelect,
    FormsModule,
    MatOption,
    MatInput,
    MatDatepickerInput,
    MatHint,
    MatDatepickerToggle,
    MatSuffix,
    CommonModule,
    MatIconButton,
    MatIcon,
    MatDatepicker,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatMiniFabButton,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    AsyncPipe,
    CurrencyPipe,
  ],
})
export class SummaryComponent implements OnInit {
  currentUser: firebase.User;
  currentGroup: Group;
  currentMember: Member;
  members$: Observable<Member[]>;
  splits$: Observable<Split[]>;
  members: Member[];
  categories: Category[];
  selectedMemberId: string = '';
  startDate: Date;
  endDate: Date;
  summaryData: AmountDue[] = [];
  detailData: AmountDue[] = [];
  summaryColumnsToDisplay: string[] = [
    'owedTo',
    'owedBy',
    'amount',
    'markPaid',
  ];
  detailColumnsToDisplay: string[] = ['category', 'amount'];

  constructor(
    private router: Router,
    private userService: UserService,
    private groupService: GroupService,
    private memberService: MemberService,
    private splitService: SplitService,
    private categoryService: CategoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private loading: LoadingService,
    private analytics: AngularFireAnalytics
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
      this.categoryService
        .getCategoriesForGroup(this.currentGroup.id)
        .pipe(
          tap((categories) => {
            this.categories = categories;
          })
        )
        .subscribe();
      this.summaryData = [];
      this.detailData = [];
      this.selectedMemberId = this.currentMember.id;
      this.loadUnpaidSplits();
    }
  }

  loadUnpaidSplits(): void {
    this.splits$ = this.splitService.getUnpaidSplitsForGroup(
      this.currentGroup.id,
      this.startDate,
      this.endDate
    );
    this.detailData = [];
    if (!!this.selectedMemberId) {
      this.onSelectMember();
    }
  }

  clearStartDate(): void {
    this.startDate = null;
    this.detailData = [];
    this.loadUnpaidSplits();
  }

  clearEndDate(): void {
    this.endDate = null;
    this.detailData = [];
    this.loadUnpaidSplits();
  }

  getMemberName(memberId: string): string {
    const member = this.members.find((m) => m.id === memberId);
    return !!member ? member.displayName : '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories.find((c) => c.id === categoryId);
    return !!category ? category.name : '';
  }

  abs(amount: number) {
    return Math.abs(amount);
  }

  onSelectMember() {
    this.loading.loadingOn();
    this.detailData = [];
    this.splits$
      .pipe(
        map((splits) => {
          this.summaryData = [];
          if (splits.length > 0) {
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
                  .reduce(
                    (total, split) => (total += split.allocatedAmount),
                    0
                  );
                const owedBySelected = memberSplits
                  .filter((m) => m.paidByMemberId == member.id)
                  .reduce(
                    (total, split) => (total += split.allocatedAmount),
                    0
                  );
                if (owedToSelected > owedBySelected) {
                  this.summaryData.push(
                    new AmountDue({
                      owedByMemberId: member.id,
                      owedToMemberId: this.selectedMemberId,
                      amount: owedToSelected - owedBySelected,
                    })
                  );
                } else if (owedBySelected > owedToSelected) {
                  this.summaryData.push(
                    new AmountDue({
                      owedToMemberId: member.id,
                      owedByMemberId: this.selectedMemberId,
                      amount: owedBySelected - owedToSelected,
                    })
                  );
                }
              });
          }
        }),
        tap(() => {
          this.loading.loadingOff();
        })
      )
      .subscribe();
  }

  onRowSelect(owedToMemberId: string, owedByMemberId: string) {
    this.loading.loadingOn();
    this.splits$
      .pipe(
        map((splits) => {
          this.detailData = [];
          const memberSplits = splits.filter(
            (s) =>
              (s.owedByMemberId == owedToMemberId ||
                s.paidByMemberId == owedToMemberId) &&
              (s.owedByMemberId == owedByMemberId ||
                s.paidByMemberId == owedByMemberId)
          );
          this.categories.forEach((category) => {
            if (
              memberSplits.filter((f) => f.categoryId == category.id).length > 0
            ) {
              const owedToMember1 = memberSplits
                .filter(
                  (s) =>
                    s.paidByMemberId == owedToMemberId &&
                    s.categoryId == category.id
                )
                .reduce((total, split) => (total += split.allocatedAmount), 0);
              const owedToMember2 = memberSplits
                .filter(
                  (s) =>
                    s.paidByMemberId == owedByMemberId &&
                    s.categoryId == category.id
                )
                .reduce((total, split) => (total += split.allocatedAmount), 0);
              this.detailData.push(
                new AmountDue({
                  categoryId: category.id,
                  amount: owedToMember1 - owedToMember2,
                })
              );
            }
          });
        }),
        tap(() => {
          this.loading.loadingOff();
        })
      )
      .subscribe();
  }

  markExpensesPaid(owedToMemberId: string, owedByMemberId: string): void {
    var splitsToPay: Split[] = [];
    this.splits$
      .pipe(
        map((splits: Split[]) => {
          this.detailData = [];
          const memberSplits = splits.filter(
            (s) =>
              (s.owedByMemberId == owedByMemberId &&
                s.paidByMemberId == owedToMemberId) ||
              (s.owedByMemberId == owedToMemberId &&
                s.paidByMemberId == owedByMemberId)
          );
          splitsToPay = memberSplits;
        })
      )
      .subscribe();
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
          .paySplitsBetweenMembers(this.currentGroup.id, splitsToPay)
          .pipe(
            tap(() => {
              this.snackBar.open('Expenses have been marked paid.', 'OK');
            }),
            catchError((err: Error) => {
              this.analytics.logEvent('error', {
                component: this.constructor.name,
                action: 'mark_expenses_paid',
                message: err.message,
              });
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
