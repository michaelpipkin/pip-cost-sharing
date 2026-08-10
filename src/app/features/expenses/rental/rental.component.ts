import { BreakpointObserver } from '@angular/cdk/layout';
import {
  afterEveryRender,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  Signal,
  viewChildren,
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
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { MemberStore } from '@store/member.store';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import {
  RentalGridComponent,
  RentalMemberRow,
} from './rental-grid/rental-grid.component';
import {
  RentalRoomsComponent,
  RoomParticipant,
} from './rental-rooms/rental-rooms.component';

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
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly rentalUtils = inject(RentalUtilsService);

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

  inputElements = viewChildren<ElementRef>('inputElement');

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
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    afterNextRender(() => {
      this.addAllActiveMembers();
      this.#showSmallScreenNoticeIfNeeded();
    });
  }

  addSelectFocus(): void {
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        if (this.value === '0.00') {
          this.value = '';
        } else {
          this.select();
        }
      });
    });
  }

  addAllActiveMembers(): void {
    this.members.set(
      this.activeMembers()
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
    const target = this.demoService.isInDemoMode()
      ? '/demo/expenses/add'
      : '/expenses/add';
    this.router.navigate([target], { state: { rental: payload } });
  }

  onCancel(): void {
    const target = this.demoService.isInDemoMode()
      ? '/demo/expenses'
      : '/expenses';
    this.router.navigate([target]);
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
          "Rental wizard works best on a full-size browser. Feel free to " +
          "continue if you'd like.",
        confirmButtonText: 'OK',
      },
    });
  }
}
