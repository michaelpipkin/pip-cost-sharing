import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { SortingService } from '@services/sorting.service';
import { TourService } from '@services/tour.service';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { DocumentReference } from 'firebase/firestore';

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
    CurrencyPipe,
    DatePipe,
    DocRefCompareDirective,
  ],
})
export class HistoryComponent implements AfterViewInit {
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly tourService = inject(TourService);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly sorter = inject(SortingService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);

  members: Signal<Member[]> = this.memberStore.groupMembers;
  history: Signal<History[]> = this.historyStore.groupHistory;
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

  filteredHistory = computed<History[]>(
    (selectedMember = this.selectedMember()) => {
      var filteredHistory = this.history().filter((history: History) => {
        return (
          history.paidByMemberRef.eq(selectedMember!) ||
          history.paidToMemberRef.eq(selectedMember!)
        );
      });
      if (this.startDate() !== undefined && this.startDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return history.date >= this.startDate()!;
        });
      }
      if (this.endDate() !== undefined && this.endDate() !== null) {
        filteredHistory = filteredHistory.filter((history: History) => {
          return history.date <= this.endDate()!;
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

  columnsToDisplay = ['date', 'paidTo', 'paidBy', 'amount', 'type'];

  constructor() {
    effect(() => {
      this.selectedMember.set(this.currentMember()?.ref ?? null);
    });
    effect(() => {
      if (!this.historyStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });
  }

  ngAfterViewInit(): void {
    this.tourService.checkForContinueTour('history');
  }

  onRowClick(history: History): void {
    if (!history.splitsPaid || history.splitsPaid.length === 0) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'This payment doesn\'t have a breakdown available' },
      });
      return;
    }
    this.router.navigate(['/analysis/history', history.id]);
  }

  sortHistory(h: { active: string; direction: string }): void {
    this.sortField.set(h.active);
    this.sortAsc.set(h.direction === 'asc');
  }

  resetHistoryTable(): void {}

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'history' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    this.tourService.startHistoryTour(true);
  }
}
