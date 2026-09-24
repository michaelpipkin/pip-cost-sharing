import { BreakpointObserver } from '@angular/cdk/layout';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  Signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import {
  RentalDetails,
  RentalRoom,
  SerializableRentalPayload,
} from '@models/expense';
import { Member } from '@models/member';
import { GuidedTourService } from '@services/guided-tour.service';
import { LocaleService } from '@services/locale.service';
import { MemberStore } from '@store/member.store';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';
import {
  RentalGridComponent,
  RentalMemberRow,
} from './rental-grid/rental-grid.component';
import {
  RentalRoomsComponent,
  RoomParticipant,
} from './rental-rooms/rental-rooms.component';
import { buildRentalTourSteps } from './rental.tour';

/**
 * Vacation Rental wizard: collects the total cost, number of nights, and
 * per-night occupancy, then hands the result off to Add Expense (as a
 * shares split) rather than duplicating the payer/category/receipt UI.
 */
@Component({
  selector: 'app-rental',
  templateUrl: './rental.component.html',
  styleUrl: './rental.component.scss',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    FormatCurrencyInputDirective,
    RentalGridComponent,
    RentalRoomsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalComponent {
  protected readonly router = inject(Router);
  protected readonly dialog = inject(MatDialog);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly memberStore = inject(MemberStore);
  protected readonly localeService = inject(LocaleService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly rentalUtils = inject(RentalUtilsService);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

  protected readonly amount = signal<string>('0.00');
  protected readonly description = signal<string>('Vacation Rental');
  protected readonly nightCount = signal<number>(1);
  protected readonly members = signal<RentalMemberRow[]>([]);

  protected readonly roomsEnabled = signal<boolean>(false);
  protected readonly rooms = signal<RentalRoom[]>([]);
  /** memberId -> roomId. Retained even while roomsEnabled() is false, so
   * toggling back on doesn't lose the user's setup. */
  protected readonly roomAssignments = signal<Record<string, string>>({});

  protected readonly totalAmountValue = computed(() =>
    this.stringUtils.toNumber(this.amount())
  );

  protected readonly roomParticipants = computed<RoomParticipant[]>(() =>
    this.members().map((p) => ({
      id: p.memberRef.id,
      name: p.displayName,
    }))
  );

  protected readonly rentalDetails = computed<RentalDetails>(() => {
    const roomsActive = this.roomsEnabled() && this.rooms().length > 0;
    const assignments = this.roomAssignments();
    return {
      nightCount: this.nightCount(),
      stays: this.members().map((p) => ({
        memberRef: p.memberRef,
        nights: p.nights
          .map((present, i) => (present ? i : -1))
          .filter((i) => i >= 0),
        ...(roomsActive ? { roomId: assignments[p.memberRef.id] } : {}),
      })),
      ...(roomsActive ? { rooms: this.rooms() } : {}),
    };
  });

  protected readonly emptyNightIndices = computed(() =>
    this.rentalUtils.emptyNights(this.rentalDetails())
  );

  protected readonly canContinue = computed(
    () =>
      this.totalAmountValue() > 0 &&
      this.nightCount() >= 1 &&
      this.members().length > 0 &&
      this.emptyNightIndices().length === 0
  );

  constructor() {
    // Leaving the page mid-tour ends it (and puts back what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    // Start the grid with the group's active members, once they've loaded
    // (on a refresh or direct link, the page renders first). Runs once, so
    // later member updates don't overwrite who the user has set up.
    const seedMembers = effect(() => {
      if (!this.memberStore.loaded()) return;
      const active = this.activeMembers();
      untracked(() => this.#seedMembers(active));
      seedMembers.destroy();
    });

    afterNextRender(() => this.#showSmallScreenNoticeIfNeeded());
  }

  #seedMembers(active: Member[]): void {
    this.members.set(
      active
        .filter((m) => !!m.ref)
        .map((m) => ({
          memberRef: m.ref!,
          displayName: m.displayName,
          nights: new Array<boolean>(this.nightCount()).fill(true),
        }))
    );
  }

  onNightCountInput(value: string): void {
    const parsed = Math.max(1, Math.round(this.stringUtils.toNumber(value)));
    this.nightCount.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  onContinue(): void {
    if (!this.canContinue()) return;
    const roomsActive = this.roomsEnabled() && this.rooms().length > 0;
    const assignments = this.roomAssignments();
    const payload: SerializableRentalPayload = {
      totalAmount: this.totalAmountValue(),
      description: this.description(),
      nightCount: this.nightCount(),
      stays: this.members().map((p) => ({
        memberId: p.memberRef.id,
        nights: p.nights
          .map((present, i) => (present ? i : -1))
          .filter((i) => i >= 0),
        ...(roomsActive ? { roomId: assignments[p.memberRef.id] } : {}),
      })),
      ...(roomsActive ? { rooms: this.rooms() } : {}),
    };
    this.router.navigate(['/expenses/add'], { state: { rental: payload } });
  }

  onCancel(): void {
    this.router.navigate(['/expenses']);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'vacation-rental' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  /**
   * Starts the guided tour. It fills in a sample stay where the wizard is
   * still at its defaults and turns on sample room rates partway through,
   * and puts everything back exactly when it ends.
   */
  startTour(): void {
    const snapshot = {
      amount: this.amount(),
      description: this.description(),
      nightCount: this.nightCount(),
      members: this.members(),
      roomsEnabled: this.roomsEnabled(),
      rooms: this.rooms(),
      roomAssignments: this.roomAssignments(),
    };
    this.guidedTour.start({
      id: 'vacation-rental',
      steps: buildRentalTourSteps({
        loadSample: () => this.#loadTourSample(),
        showRooms: (on) => this.#showTourRooms(on),
      }),
      onEnd: () => {
        this.amount.set(snapshot.amount);
        this.description.set(snapshot.description);
        this.nightCount.set(snapshot.nightCount);
        this.members.set(snapshot.members);
        this.roomsEnabled.set(snapshot.roomsEnabled);
        this.rooms.set(snapshot.rooms);
        this.roomAssignments.set(snapshot.roomAssignments);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  /**
   * A four-night, three-person stay where the last person skipped the last
   * night. Only fills in what's still at its default; sample people (with
   * local refs the tour never reads or writes) make up the three.
   */
  #loadTourSample(): void {
    if (this.totalAmountValue() === 0) {
      const currency = this.localeService.currency();
      this.amount.set(
        (1200)
          .toFixed(currency.decimalPlaces)
          .replace('.', currency.decimalSeparator)
      );
    }
    if (this.nightCount() === 1) this.nightCount.set(4);
    const nightCount = this.nightCount();
    const allNights = () => new Array<boolean>(nightCount).fill(true);

    let rows = this.members().map((row) => ({
      ...row,
      nights: Array.from(
        { length: nightCount },
        (_, i) => row.nights[i] ?? true
      ),
    }));
    const samples = [
      ['tour-sample-alex', 'Alex'],
      ['tour-sample-jordan', 'Jordan'],
      ['tour-sample-sam', 'Sam'],
    ]
      .slice(0, Math.max(0, 3 - rows.length))
      .map(([id, displayName]) => ({
        memberRef: doc(this.fs, `members/${id}`) as DocumentReference<Member>,
        displayName: displayName!,
        nights: allNights(),
      }));
    rows = [...rows, ...samples];
    if (rows.every((row) => row.nights.every(Boolean))) {
      rows = rows.map((row, i) =>
        i === rows.length - 1
          ? { ...row, nights: row.nights.map((_, n) => n < nightCount - 1) }
          : row
      );
    }
    this.members.set(rows);
  }

  /** Room rates on or off; with none set up, a suite and a shared bunk room. */
  #showTourRooms(on: boolean): void {
    this.roomsEnabled.set(on);
    if (!on || this.rooms().length > 0) return;
    this.rooms.set([
      { id: 'tour-sample-suite', name: 'Master Suite', rate: 1.5 },
      { id: 'tour-sample-bunk', name: 'Bunk Room', rate: 1 },
    ]);
    this.roomAssignments.set(
      Object.fromEntries(
        this.members().map((row, i) => [
          row.memberRef.id,
          i === 0 ? 'tour-sample-suite' : 'tour-sample-bunk',
        ])
      )
    );
  }

  /**
   * One-time check on load (not an ongoing subscription) - resizing the
   * window after landing on the page shouldn't keep re-triggering this.
   */
  #showSmallScreenNoticeIfNeeded(): void {
    if (!this.breakpointObserver.isMatched('(max-width: 767px)')) return;
    this.dialog.open(ConfirmDialogComponent, {
      disableClose: false,
      maxWidth: '400px',
      data: {
        dialogTitle: 'Best Viewed on a Larger Screen',
        confirmationText:
          'Due to the amount of information collected, the Vacation ' +
          'Rental wizard works best on a full-size browser. Feel free to ' +
          "continue if you'd like.",
        confirmButtonText: 'OK',
      },
    });
  }
}
