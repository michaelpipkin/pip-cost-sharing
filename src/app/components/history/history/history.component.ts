import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { HistoryService } from '@services/history.service';
import { SortingService } from '@services/sorting.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { LoadingService } from '@shared/loading/loading.service';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { HistoryHelpComponent } from '../history-help/history-help.component';
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
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
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
    MatFormFieldModule,
    MatSelectModule,
    FormsModule,
    MatOptionModule,
    MatButtonModule,
    MatTableModule,
    MatSortModule,
    MatTooltipModule,
    MatIconModule,
    MatSlideToggleModule,
    MatInputModule,
    MatDatepickerModule,
    CurrencyPipe,
    DatePipe,
  ],
})
export class HistoryComponent {
  groupStore = inject(GroupStore);
  memberStore = inject(MemberStore);
  historyService = inject(HistoryService);
  historyStore = inject(HistoryStore);
  dialog = inject(MatDialog);
  sorter = inject(SortingService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  history: Signal<History[]> = this.historyStore.groupHistory;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  currentMember: Signal<Member> = this.memberStore.currentMember;

  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  selectedMemberId = model<string>(this.currentMember()?.id ?? '');
  startDate = model<Date | null>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ); // 30 days ago
  endDate = model<Date | null>(null);

  filteredHistory = computed<History[]>(
    (selectedMemberId = this.selectedMemberId()) => {
      var filteredHistory = this.history().filter((history: History) => {
        return (
          history.paidByMemberRef.id === selectedMemberId ||
          history.paidToMemberRef.id === selectedMemberId
        );
      });
      if (this.startDate() !== undefined && this.startDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return history.date.toDate() >= this.startDate();
        });
      }
      if (this.endDate() !== undefined && this.endDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return history.date.toDate() <= this.endDate();
        });
      }
      if (filteredHistory.length > 0) {
        filteredHistory = this.sorter.sort(
          filteredHistory,
          this.sortField(),
          this.sortAsc()
        );
      }
      return filteredHistory;
    }
  );

  expandedHistory = model<History | null>(null);

  columnsToDisplay = computed<string[]>(() => {
    return this.currentMember()?.groupAdmin
      ? ['date', 'paidTo', 'paidBy', 'amount', 'delete']
      : ['date', 'paidTo', 'paidBy', 'amount'];
  });

  constructor() {
    effect(() => {
      this.selectedMemberId.set(this.currentMember()?.id ?? '');
    });
  }

  onExpandClick(history: History): void {
    this.expandedHistory.update((h) => (h === history ? null : history));
  }

  onDeleteClick(history: History): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: 'this payment record',
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.historyService
          .deleteHistory(this.currentGroup().id, history.id)
          .then(() => {
            this.expandedHistory.set(null);
            this.snackBar.open('Payment record deleted', 'OK');
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }

  sortHistory(h: { active: string; direction: string }): void {
    this.sortField.set(h.active);
    this.sortAsc.set(h.direction === 'asc');
  }

  getMemberName(memberId: string): string {
    const member = this.members().find((m) => m.id === memberId);
    return member?.displayName ?? '';
  }

  resetHistoryTable(): void {
    this.expandedHistory.set(null);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HistoryHelpComponent, dialogConfig);
  }
}
