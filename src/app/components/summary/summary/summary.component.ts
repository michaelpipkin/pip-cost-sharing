import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { CurrencyPipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
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
import { AmountDue } from '@models/amount-due';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Split } from '@models/split';
import { HistoryService } from '@services/history.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import * as firestore from 'firebase/firestore';
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';
import { SummaryHelpComponent } from '../summary-help/summary-help.component';

@Component({
  selector: 'app-summary',
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition(
        'expanded <=> collapsed',
        animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')
      ),
    ]),
  ],
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
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly splitService = inject(SplitService);
  protected readonly splitStore = inject(SplitStore);
  protected readonly historyService = inject(HistoryService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly analytics = inject(getAnalytics);

  categories: Signal<Category[]> = this.categoryStore.groupCategories;
  members: Signal<Member[]> = this.memberStore.groupMembers;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  splits: Signal<Split[]> = this.splitStore.unpaidSplits;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

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
        this.members()
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
          memberSplits.filter(
            (split: Split) => split.categoryRef == category.ref
          ).length > 0
        ) {
          const owedToMember1 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberId == owedToMemberId &&
                s.categoryRef == category.ref
            )
            .reduce((total, split) => (total += split.allocatedAmount), 0);
          const owedToMember2 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberId == owedByMemberId &&
                s.categoryRef == category.ref
            )
            .reduce((total, split) => (total += split.allocatedAmount), 0);
          detailData.push(
            new AmountDue({
              categoryRef: category.ref,
              amount: owedToMember1 - owedToMember2,
            })
          );
        }
      });
      return detailData;
    }
  );

  expandedDetail = model<AmountDue | null>(null);

  constructor() {
    effect(() => {
      this.selectedMemberId.set(this.currentMember()?.id ?? '');
    });
    effect(() => {
      if (!this.splitStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

  onExpandClick(amountDue: AmountDue): void {
    this.expandedDetail.update((d) => (d === amountDue ? null : amountDue));
    this.owedByMemberId.set(amountDue.owedByMemberId);
    this.owedToMemberId.set(amountDue.owedToMemberId);
  }

  getMemberName(memberId: string): string {
    const member = this.members().find((m) => m.id === memberId);
    return member?.displayName ?? '';
  }

  getCategoryName(categoryId: string): string {
    const category = this.categories().find((c) => c.id === categoryId);
    return category?.name ?? '';
  }

  resetDetail(): void {
    this.expandedDetail.set(null);
  }

  async payExpenses(
    owedToMemberId: string,
    owedByMemberId: string
  ): Promise<void> {
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
    let paymentMethods = {};
    this.loading.loadingOn();
    await this.userService
      .getPaymentMethods(this.currentGroup().id, owedToMemberId)
      .then((methods: Object) => {
        paymentMethods = methods;
      })
      .finally(() => this.loading.loadingOff());
    const dialogConfig: MatDialogConfig = {
      data: {
        payToMemberName: this.getMemberName(owedToMemberId),
        ...paymentMethods,
      },
    };
    const dialogRef = this.dialog.open(PaymentDialogComponent, dialogConfig);
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
            category: this.getCategoryName(split.categoryRef.id),
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

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(SummaryHelpComponent, dialogConfig);
  }
}
