import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { RentalDetails, SerializableRentalPayload } from '@models/expense';
import { Member } from '@models/member';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { MemberStore } from '@store/member.store';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import {
  RentalGridComponent,
  RentalParticipantRow,
} from './rental-grid/rental-grid.component';

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
    MatTooltipModule,
    FormatCurrencyInputDirective,
    RentalGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalComponent {
  protected readonly router = inject(Router);
  protected readonly dialog = inject(MatDialog);
  protected readonly memberStore = inject(MemberStore);
  protected readonly demoService = inject(DemoService);
  protected readonly localeService = inject(LocaleService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly rentalUtils = inject(RentalUtilsService);

  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

  protected readonly amount = signal<string>('0.00');
  protected readonly description = signal<string>('Vacation Rental');
  protected readonly nightCount = signal<number>(1);
  protected readonly participants = signal<RentalParticipantRow[]>([]);

  protected readonly totalAmountValue = computed(() =>
    this.stringUtils.toNumber(this.amount())
  );

  protected readonly rentalDetails = computed<RentalDetails>(() => ({
    nightCount: this.nightCount(),
    stays: this.participants().map((p) => ({
      memberRef: p.memberRef,
      nights: p.nights
        .map((present, i) => (present ? i : -1))
        .filter((i) => i >= 0),
    })),
  }));

  protected readonly emptyNightIndices = computed(() =>
    this.rentalUtils.emptyNights(this.rentalDetails())
  );

  protected readonly canContinue = computed(
    () =>
      this.totalAmountValue() > 0 &&
      this.nightCount() >= 1 &&
      this.participants().length > 0 &&
      this.emptyNightIndices().length === 0
  );

  constructor() {
    afterNextRender(() => {
      this.addAllActiveMembers();
    });
  }

  addAllActiveMembers(): void {
    this.participants.set(
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
    const payload: SerializableRentalPayload = {
      totalAmount: this.totalAmountValue(),
      description: this.description(),
      nightCount: this.nightCount(),
      stays: this.participants().map((p) => ({
        memberId: p.memberRef.id,
        nights: p.nights
          .map((present, i) => (present ? i : -1))
          .filter((i) => i >= 0),
      })),
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
}
