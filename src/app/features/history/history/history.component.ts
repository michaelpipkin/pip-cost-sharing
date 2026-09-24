import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { LocaleService } from '@services/locale.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { SortingService } from '@services/sorting.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  Signal,
  signal,
} from '@angular/core';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { buildHistoryTourSteps } from './history.tour';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss',
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
    MatInputModule,
    MatDatepickerModule,
    MatCardModule,
    CurrencyPipe,
    DatePipe,
    DocRefCompareDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent {
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly sorter = inject(SortingService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly localeService = inject(LocaleService);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  // Sample payments the guided tour shows a group with no history yet.
  // Held here, never in the store, and cleared when the tour ends.
  protected readonly tourSample = signal<History[] | null>(null);
  history: Signal<History[]> = computed(
    () => this.tourSample() ?? this.historyStore.groupHistory()
  );
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  currentMember: Signal<Member | null> = this.memberStore.currentMember;

  sortField = signal<string>('date');
  sortAsc = signal<boolean>(true);

  selectedMember = model<DocumentReference<Member> | null>(
    this.currentMember()?.ref ?? null
  );
  startDate = model<Date | null>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ); // 30 days ago
  endDate = model<Date | null>(null);

  filteredHistory = computed<History[]>(() => {
    const selectedMember = this.selectedMember();
    if (!selectedMember) return [];
    const startDate = this.startDate();
    const endDate = this.endDate();
    let filteredHistory = this.history().filter(
      (history: History) =>
        (history.paidByMemberRef.eq(selectedMember) ||
          history.paidToMemberRef.eq(selectedMember)) &&
        (!startDate || history.date >= startDate) &&
        (!endDate || history.date <= endDate)
    );
    if (filteredHistory.length > 0) {
      filteredHistory = this.sorter.sort(
        filteredHistory,
        this.sortField(),
        this.sortAsc()
      );
    }
    return filteredHistory;
  });

  columnsToDisplay = ['date', 'paidTo', 'paidBy', 'amount', 'type'];

  constructor() {
    // Leaving the page mid-tour ends it (and clears the sample)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      this.selectedMember.set(this.currentMember()?.ref ?? null);
    });
    effect(() => {
      if (this.historyStore.loaded()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });
  }

  onRowClick(history: History): void {
    if (!history.splitsPaid || history.splitsPaid.length === 0) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: "This payment doesn't have a breakdown available" },
      });
      return;
    }
    this.router.navigate(['/analysis/history', history.id]);
  }

  sortHistory(h: { active: string; direction: string }): void {
    this.sortField.set(h.active);
    this.sortAsc.set(h.direction === 'asc');
  }

  /**
   * Starts the guided tour. A group with no payments yet sees a few sample
   * payments to and from you, cleared when the tour ends.
   */
  startTour(): void {
    const me = this.currentMember();
    if (this.historyStore.groupHistory().length === 0 && me?.ref) {
      this.tourSample.set(this.#tourSampleHistory(me));
    }
    this.guidedTour.start({
      id: 'history',
      steps: buildHistoryTourSteps({
        usingSample: () => this.tourSample() !== null,
      }),
      onEnd: () => this.tourSample.set(null),
      fullHelp: () => this.showHelp(),
    });
  }

  #tourSampleHistory(me: Member): History[] {
    // Pay other real members when there are any; otherwise sample members
    const others = this.members().filter((m) => m.id !== me.id);
    const sampleMember = (id: string, displayName: string) =>
      new Member({
        id,
        displayName,
        ref: doc(this.fs, `members/${id}`) as DocumentReference<Member>,
      });
    const alex = others[0] ?? sampleMember('tour-sample-alex', 'Alex');
    const jordan =
      others[1] ?? others[0] ?? sampleMember('tour-sample-jordan', 'Jordan');
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    const payment = (
      id: string,
      from: Member,
      to: Member,
      totalPaid: number,
      days: number,
      batchId?: string
    ) =>
      new History({
        id,
        date: daysAgo(days),
        paidByMemberRef: from.ref!,
        paidByMember: from,
        paidToMemberRef: to.ref!,
        paidToMember: to,
        totalPaid,
        batchId,
        // Built locally; the tour never reads or writes it
        ref: doc(this.fs, `history/${id}`) as DocumentReference<History>,
      });
    return [
      payment('tour-sample-1', me, alex, 42.5, 3),
      payment('tour-sample-2', jordan, me, 118.2, 10),
      payment('tour-sample-3', me, alex, 64, 20, 'tour-sample-batch'),
    ];
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'history' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
