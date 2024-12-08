import { CurrencyPipe } from '@angular/common';
import {
  Component,
  computed,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HelpComponent } from '@components/help/help.component';
import { AmountDue } from '@models/amount-due';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { GroupService } from '@services/group.service';
import { HistoryService } from '@services/history.service';
import { MemberService } from '@services/member.service';
import { SplitService } from '@services/split.service';
import { ConfirmDialogComponent } from '@shared/confirm-dialog/confirm-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import * as firestore from 'firebase/firestore';

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatDatepickerModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatTableModule,
    CurrencyPipe,
  ],
})
export class SummaryComponent {
  router = inject(Router);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  splitService = inject(SplitService);
  historyService = inject(HistoryService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  analytics = inject(Analytics);

  categories: Signal<Category[]> = this.categoryService.groupCategories;
  allMembers: Signal<Member[]> = this.memberService.groupMembers;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  currentMember: Signal<Member> = this.memberService.currentMember;
  splits: Signal<Split[]> = this.splitService.unpaidSplits;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;

  owedToMemberId = signal<string>('');
  owedByMemberId = signal<string>('');

  selectedMemberId = model<string>(this.currentMember()?.id ?? '');
  startDate = model<Date | null>(null);
  endDate = model<Date | null>(null);

  filteredSplits = computed(() => {
    var startDate: Date | null;
    var endDate: Date | null;
    if (this.startDate() == null) {
      startDate = new Date('1/1/1900');
    } else {
      startDate = new Date(this.startDate());
    }
    if (this.endDate() == null) {
      const today = new Date();
      endDate = new Date(today.setFullYear(today.getFullYear() + 100));
    } else {
      endDate = new Date(this.endDate());
      endDate = new Date(endDate.setDate(endDate.getDate() + 1));
    }
    return this.splits().filter((split: Split) => {
      return split.date.toDate() >= startDate && split.date.toDate() < endDate;
    });
  });

  summaryData = computed(
    (
      selectedMemberId: string = this.selectedMemberId(),
      splits: Split[] = this.filteredSplits()
    ) => {
      var summaryData: AmountDue[] = [];
      if (splits.length > 0) {
        var memberSplits = splits.filter((s) => {
          return (
            s.owedByMemberId == selectedMemberId ||
            s.paidByMemberId == selectedMemberId
          );
        });
        this.allMembers()
          .filter((m) => m.id != selectedMemberId)
          .forEach((member) => {
            const owedToSelected = memberSplits
              .filter((m) => m.owedByMemberId == member.id)
              .reduce((total, split) => (total += split.allocatedAmount), 0);
            const owedBySelected = memberSplits
              .filter((m) => m.paidByMemberId == member.id)
              .reduce((total, split) => (total += split.allocatedAmount), 0);
            if (owedToSelected > owedBySelected) {
              summaryData.push(
                new AmountDue({
                  owedByMemberId: member.id,
                  owedToMemberId: selectedMemberId,
                  amount: owedToSelected - owedBySelected,
                })
              );
            } else if (owedBySelected > owedToSelected) {
              summaryData.push(
                new AmountDue({
                  owedToMemberId: member.id,
                  owedByMemberId: selectedMemberId,
                  amount: owedBySelected - owedToSelected,
                })
              );
            }
          });
      }
      return summaryData;
    }
  );

  detailData = computed(
    (
      owedToMemberId: string = this.owedToMemberId(),
      owedByMemberId: string = this.owedByMemberId(),
      splits: Split[] = this.filteredSplits(),
      categories: Category[] = this.categories()
    ) => {
      var detailData: AmountDue[] = [];
      const memberSplits = splits.filter(
        (s) =>
          (s.owedByMemberId == owedToMemberId ||
            s.paidByMemberId == owedToMemberId) &&
          (s.owedByMemberId == owedByMemberId ||
            s.paidByMemberId == owedByMemberId)
      );
      categories.forEach((category) => {
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
          detailData.push(
            new AmountDue({
              categoryId: category.id,
              amount: owedToMember1 - owedToMember2,
            })
          );
        }
      });
      return detailData;
    }
  );

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'summary',
        title: 'Summary Help',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  clearOwedByToMemberIds(): void {
    this.owedToMemberId.set('');
    this.owedByMemberId.set('');
  }

  getMemberName(memberId: string): string {
    const member = this.allMembers().find((m) => m.id === memberId);
    return member?.displayName ?? '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find((c) => c.id === categoryId);
    return category?.name ?? '';
  }

  onRowSelect(owedToMemberId: string, owedByMemberId: string) {
    if (this.categories().length > 1) {
      this.owedToMemberId.set(owedToMemberId);
      this.owedByMemberId.set(owedByMemberId);
    }
  }

  resetDetail(): void {
    this.owedToMemberId.set('');
    this.owedByMemberId.set('');
  }

  markExpensesPaid(owedToMemberId: string, owedByMemberId: string): void {
    this.owedToMemberId.set(owedToMemberId);
    this.owedByMemberId.set(owedByMemberId);
    var splitsToPay: Split[] = [];
    const memberSplits = this.filteredSplits().filter(
      (s) =>
        (s.owedByMemberId == owedByMemberId &&
          s.paidByMemberId == owedToMemberId) ||
        (s.owedByMemberId == owedToMemberId &&
          s.paidByMemberId == owedByMemberId)
    );
    splitsToPay = memberSplits;
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
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        let history = {
          date: firestore.Timestamp.now(),
          totalPaid: +splitsToPay
            .reduce(
              (total, s) =>
                s.paidByMemberId === owedToMemberId
                  ? (total += +s.allocatedAmount)
                  : (total -= +s.allocatedAmount),
              0
            )
            .toFixed(2),
          lineItems: [],
        };
        this.detailData().forEach((split) => {
          history.lineItems.push({
            category: this.getCategoryName(split.categoryId),
            amount: split.amount,
          });
        });
        await this.splitService
          .paySplitsBetweenMembers(
            this.currentGroup().id,
            splitsToPay,
            owedByMemberId,
            owedToMemberId,
            history
          )
          .then(async () => {
            this.snackBar.open('Expenses have been marked paid.', 'OK');
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'mark_expenses_paid',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not mark expenses paid.',
              'Close'
            );
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }
}
