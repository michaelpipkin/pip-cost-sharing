import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTable } from '@angular/material/table';
import { AmountDue } from '@models/amount-due';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { catchError, map, Observable, tap, throwError } from 'rxjs';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
})
export class SummaryComponent implements OnChanges {
  @Input() isGroupAdmin: boolean = false;
  @Input() groupId: string = '';
  members$: Observable<Member[]>;
  members: Member[];
  splits$: Observable<Split[]>;
  selectedMemberId: string = '';
  tableData: AmountDue[] = [];
  columnsToDisplay: string[] = ['owedTo', 'owedBy', 'amount', 'markPaid'];

  @ViewChild(MatTable) table: MatTable<AmountDue>;

  constructor(
    private memberService: MemberService,
    private splitService: SplitService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!!changes.groupId) {
      this.groupId = changes.groupId.currentValue;
    }
    this.members$ = this.memberService.getAllGroupMembers(this.groupId).pipe(
      tap((members) => {
        this.members = members;
      })
    );
    this.splits$ = this.splitService.getUnpaidSplitsForGroup(this.groupId);
    this.tableData = [];
    this.selectedMemberId = '';
  }

  getMemberName(memberId: string): string {
    const member = this.members.find((m) => m.id === memberId);
    return !!member ? member.displayName : '';
  }

  onSelectMember(e: MatSelectChange) {
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
          .paySplitsBetweenMembers(owedToMemberId, owedByMemberId)
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
