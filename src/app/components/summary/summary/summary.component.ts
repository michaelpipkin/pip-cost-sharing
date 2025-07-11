import { CurrencyPipe } from '@angular/common';
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
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { DocumentReference, Timestamp } from 'firebase/firestore';
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';
import { SummaryHelpComponent } from '../summary-help/summary-help.component';
import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';

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
    DocRefCompareDirective,
    DateShortcutKeysDirective,
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

  owedToMember = signal<DocumentReference<Member>>(null);
  owedByMember = signal<DocumentReference<Member>>(null);

  selectedMember = model<DocumentReference<Member>>(
    this.currentMember()?.ref ?? null
  );
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
      selectedMember: DocumentReference<Member> = this.selectedMember(),
      splits: Split[] = this.filteredSplits()
    ) => {
      var summaryData: AmountDue[] = [];
      if (splits.length > 0) {
        var memberSplits = splits.filter((s) => {
          return (
            s.owedByMemberRef.eq(selectedMember) ||
            s.paidByMemberRef.eq(selectedMember)
          );
        });
        this.members()
          .filter((m) => !m.ref.eq(selectedMember))
          .forEach((member) => {
            const owedToSelected = +memberSplits
              .filter((m) => m.owedByMemberRef.eq(member.ref))
              .reduce((total, split) => (total += split.allocatedAmount), 0)
              .toFixed(2);
            const owedBySelected = +memberSplits
              .filter((m) => m.paidByMemberRef.eq(member.ref))
              .reduce((total, split) => (total += split.allocatedAmount), 0)
              .toFixed(2);
            if (owedToSelected > owedBySelected) {
              summaryData.push(
                new AmountDue({
                  owedByMemberRef: member.ref,
                  owedToMemberRef: selectedMember,
                  amount: owedToSelected - owedBySelected,
                })
              );
            } else if (owedBySelected > owedToSelected) {
              summaryData.push(
                new AmountDue({
                  owedToMemberRef: member.ref,
                  owedByMemberRef: selectedMember,
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
      owedToMember: DocumentReference<Member> = this.owedToMember(),
      owedByMember: DocumentReference<Member> = this.owedByMember(),
      splits: Split[] = this.filteredSplits(),
      categories: Category[] = this.categories()
    ) => {
      var detailData: AmountDue[] = [];
      const memberSplits = splits.filter(
        (s) =>
          (s.owedByMemberRef.eq(owedToMember) ||
            s.paidByMemberRef.eq(owedToMember)) &&
          (s.owedByMemberRef.eq(owedByMember) ||
            s.paidByMemberRef.eq(owedByMember))
      );
      categories.forEach((category) => {
        if (
          memberSplits.filter((split: Split) =>
            split.categoryRef.eq(category.ref)
          ).length > 0
        ) {
          const owedToMember1 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberRef.eq(owedToMember) &&
                s.categoryRef.eq(category.ref)
            )
            .reduce((total, split) => (total += split.allocatedAmount), 0);
          const owedToMember2 = memberSplits
            .filter(
              (s: Split) =>
                s.paidByMemberRef.eq(owedByMember) &&
                s.categoryRef.eq(category.ref)
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
      this.selectedMember.set(this.currentMember()?.ref ?? null);
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
    this.owedByMember.set(amountDue.owedByMemberRef);
    this.owedToMember.set(amountDue.owedToMemberRef);
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
    owedToMember: DocumentReference<Member>,
    owedByMember: DocumentReference<Member>
  ): Promise<void> {
    this.owedToMember.set(owedToMember);
    this.owedByMember.set(owedByMember);
    var splitsToPay: Split[] = [];
    const memberSplits = this.filteredSplits().filter(
      (s) =>
        (s.owedByMemberRef.eq(owedByMember) &&
          s.paidByMemberRef.eq(owedToMember)) ||
        (s.owedByMemberRef.eq(owedToMember) &&
          s.paidByMemberRef.eq(owedByMember))
    );
    splitsToPay = memberSplits;
    let paymentMethods = {};
    this.loading.loadingOn();
    await this.userService
      .getPaymentMethods(owedToMember)
      .then((methods: Object) => {
        paymentMethods = methods;
      })
      .finally(() => this.loading.loadingOff());
    const dialogConfig: MatDialogConfig = {
      data: {
        payToMemberName: this.getMemberName(owedToMember.id),
        ...paymentMethods,
      },
    };
    const dialogRef = this.dialog.open(PaymentDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        let history = {
          paidByMemberRef: owedByMember,
          paidToMemberRef: owedToMember,
          date: Timestamp.now(),
          totalPaid: +splitsToPay
            .reduce(
              (total, s) =>
                s.paidByMemberRef.eq(owedToMember)
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
          .paySplitsBetweenMembers(this.currentGroup().id, splitsToPay, history)
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
