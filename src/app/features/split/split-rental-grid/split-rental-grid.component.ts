import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RentalDetails } from '@models/expense';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import {
  AllocationSplit,
  AllocationUtilsService,
} from '@utils/allocation-utils.service';
import { RentalUtilsService } from '@utils/rental-utils.service';

/** A single participant's per-night occupancy within the grid UI. */
export interface SplitRentalRow {
  name: string;
  nights: boolean[];
}

/**
 * Members x nights occupancy grid for the standalone Split Expense
 * calculator's Vacation Rental option. Structurally mirrors
 * RentalGridComponent (the group-expense flow's version - see
 * src/app/features/expenses/rental/rental-grid/), but participants are
 * plain typed-in name strings instead of DocumentReference<Member>, since
 * this feature has no persistent Members to pick from. Shares the same
 * layout CSS via the occupancy-grid mixin (see _occupancy-grid.scss).
 */
@Component({
  selector: 'app-split-rental-grid',
  templateUrl: './split-rental-grid.component.html',
  styleUrl: './split-rental-grid.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    CurrencyPipe,
    DecimalPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SplitRentalGridComponent {
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly rentalUtils = inject(RentalUtilsService);

  nightCount = input.required<number>();
  totalAmount = input<number>(0);

  participants = model<SplitRentalRow[]>([]);

  /** Not a signal: typing triggers CD via the (input) event same as any
   * other template-originated change under OnPush, so canAddParticipant()
   * (a plain method, not computed()) re-evaluates correctly on every
   * keystroke without needing this field itself to be reactive. */
  protected newParticipantName = '';

  protected readonly nightIndices = computed(() =>
    Array.from({ length: this.nightCount() }, (_, i) => i)
  );

  protected readonly occupancyByNight = computed<number[]>(() => {
    const counts = new Array<number>(this.nightCount()).fill(0);
    this.participants().forEach((row) => {
      row.nights.forEach((present, night) => {
        if (present && night < counts.length) counts[night]!++;
      });
    });
    return counts;
  });

  protected readonly emptyNightIndices = computed(() =>
    this.occupancyByNight()
      .map((count, night) => (count === 0 ? night : -1))
      .filter((night) => night >= 0)
  );

  protected readonly shareResults = computed(() => {
    const details: RentalDetails<string> = {
      nightCount: this.nightCount(),
      stays: this.participants().map((row) => ({
        memberRef: row.name,
        nights: row.nights
          .map((present, night) => (present ? night : -1))
          .filter((night) => night >= 0),
      })),
    };
    return this.rentalUtils.computeShares<string>(details);
  });

  protected readonly previewSplits = computed<AllocationSplit[]>(() => {
    const rows = this.participants();
    if (rows.length === 0) return [];
    const shareByName = new Map(
      this.shareResults().map((r) => [r.memberRef, r.shares])
    );
    const splits: AllocationSplit[] = rows.map((row) => ({
      owedByMemberRef: row.name,
      assignedAmount: 0,
      percentage: 0,
      shares: shareByName.get(row.name) ?? 0,
      allocatedAmount: 0,
    }));
    return this.allocationUtils.allocateByShares({
      totalAmount: this.totalAmount(),
      splits,
    }).splits;
  });

  protected readonly totalShares = computed(() =>
    this.shareResults().reduce((total, r) => total + r.shares, 0)
  );

  protected readonly totalPreviewAmount = computed(() =>
    this.previewSplits().reduce((total, s) => total + s.allocatedAmount, 0)
  );

  protected readonly emptyNightLabel = computed(() =>
    this.emptyNightIndices()
      .map((n) => n + 1)
      .join(', ')
  );

  constructor() {
    // Keep each participant's nights array in sync with the current night
    // count (padding new nights as present, truncating removed ones).
    effect(() => {
      const count = this.nightCount();
      this.participants.update((rows) =>
        rows.map((row) => ({
          ...row,
          nights: this.#resizeNights(row.nights, count),
        }))
      );
    });
  }

  protected canAddParticipant(): boolean {
    const trimmed = this.newParticipantName.trim();
    return trimmed.length > 0 && !this.#hasParticipantNamed(trimmed);
  }

  protected isDuplicateName(): boolean {
    const trimmed = this.newParticipantName.trim();
    return trimmed.length > 0 && this.#hasParticipantNamed(trimmed);
  }

  protected addParticipant(): void {
    const trimmed = this.newParticipantName.trim();
    if (!trimmed || this.#hasParticipantNamed(trimmed)) return;
    this.participants.update((rows) => [
      ...rows,
      { name: trimmed, nights: this.#resizeNights([], this.nightCount()) },
    ]);
    this.newParticipantName = '';
  }

  protected removeParticipant(index: number): void {
    this.participants.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected toggleNight(participantIndex: number, nightIndex: number): void {
    this.participants.update((rows) =>
      rows.map((row, i) => {
        if (i !== participantIndex) return row;
        const nights = [...row.nights];
        nights[nightIndex] = !nights[nightIndex];
        return { ...row, nights };
      })
    );
  }

  protected setAllForNight(nightIndex: number, present: boolean): void {
    this.participants.update((rows) =>
      rows.map((row) => {
        const nights = [...row.nights];
        nights[nightIndex] = present;
        return { ...row, nights };
      })
    );
  }

  protected isNightFull(nightIndex: number): boolean {
    const rows = this.participants();
    return rows.length > 0 && rows.every((row) => row.nights[nightIndex]);
  }

  protected isNightPartial(nightIndex: number): boolean {
    const rows = this.participants();
    const presentCount = rows.filter((row) => row.nights[nightIndex]).length;
    return presentCount > 0 && presentCount < rows.length;
  }

  protected shareFor(name: string): number {
    return (
      this.shareResults().find((r) => r.memberRef === name)?.shares ?? 0
    );
  }

  protected amountFor(name: string): number {
    return (
      this.previewSplits().find((s) => s.owedByMemberRef === name)
        ?.allocatedAmount ?? 0
    );
  }

  #hasParticipantNamed(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return this.participants().some(
      (p) => p.name.trim().toLowerCase() === normalized
    );
  }

  #resizeNights(nights: boolean[], count: number): boolean[] {
    const resized = nights.slice(0, count);
    while (resized.length < count) resized.push(true);
    return resized;
  }
}
