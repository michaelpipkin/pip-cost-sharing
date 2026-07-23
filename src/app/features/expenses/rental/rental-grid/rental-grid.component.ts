import { CurrencyPipe, DecimalPipe } from '@angular/common';
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
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { RentalDetails } from '@models/expense';
import { Member } from '@models/member';
import {
  AllocationSplit,
  AllocationUtilsService,
} from '@utils/allocation-utils.service';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { DocumentReference } from 'firebase/firestore';

/** A single member's per-night occupancy within the grid UI. */
export interface RentalMemberRow {
  memberRef: DocumentReference<Member>;
  displayName: string;
  nights: boolean[];
}

/**
 * Reusable members x nights occupancy grid for vacation rental expenses.
 * Hosted both by the add-flow wizard (RentalComponent) and the edit-flow
 * dialog (RentalEditDialogComponent). Owns member add/remove and
 * per-night presence, and computes a live shares + dollar preview via
 * RentalUtilsService and the existing AllocationUtilsService.
 */
@Component({
  selector: 'app-rental-grid',
  templateUrl: './rental-grid.component.html',
  styleUrl: './rental-grid.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    DocRefCompareDirective,
    CurrencyPipe,
    DecimalPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalGridComponent {
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly rentalUtils = inject(RentalUtilsService);

  /** Members eligible to be added as members (typically active group members). */
  availableMembers = input.required<Member[]>();
  nightCount = input.required<number>();
  totalAmount = input<number>(0);

  members = model<RentalMemberRow[]>([]);

  protected selectedMemberToAdd: DocumentReference<Member> | null = null;

  protected readonly nightIndices = computed(() =>
    Array.from({ length: this.nightCount() }, (_, i) => i)
  );

  protected readonly occupancyByNight = computed<number[]>(() => {
    const counts = new Array<number>(this.nightCount()).fill(0);
    this.members().forEach((row) => {
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
    const details: RentalDetails = {
      nightCount: this.nightCount(),
      stays: this.members().map((row) => ({
        memberRef: row.memberRef,
        nights: row.nights
          .map((present, night) => (present ? night : -1))
          .filter((night) => night >= 0),
      })),
    };
    return this.rentalUtils.computeShares(details);
  });

  protected readonly previewSplits = computed<AllocationSplit[]>(() => {
    const rows = this.members();
    if (rows.length === 0) return [];
    const shareById = new Map(
      this.shareResults().map((r) => [r.memberRef.id, r.shares])
    );
    const splits: AllocationSplit[] = rows.map((row) => ({
      owedByMemberRef: row.memberRef,
      assignedAmount: 0,
      percentage: 0,
      shares: shareById.get(row.memberRef.id) ?? 0,
      allocatedAmount: 0,
    }));
    return this.allocationUtils.allocateByShares({
      totalAmount: this.totalAmount(),
      splits,
    }).splits;
  });

  protected readonly remainingMembers = computed(() => {
    const usedIds = new Set(this.members().map((row) => row.memberRef.id));
    return this.availableMembers().filter((m) => !usedIds.has(m.id));
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
    // Keep each member's nights array in sync with the current night
    // count (padding new nights as present, truncating removed ones).
    effect(() => {
      const count = this.nightCount();
      this.members.update((rows) =>
        rows.map((row) => ({
          ...row,
          nights: this.#resizeNights(row.nights, count),
        }))
      );
    });
  }

  protected addSelectedMember(): void {
    const memberRef = this.selectedMemberToAdd;
    if (!memberRef) return;
    const member = this.availableMembers().find((m) => m.ref?.eq(memberRef));
    if (!member?.ref) return;
    this.#addMember(member);
    this.selectedMemberToAdd = null;
  }

  protected addAllRemainingMembers(): void {
    const toAdd = this.remainingMembers();
    toAdd.forEach((member) => this.#addMember(member));
  }

  protected removeMember(index: number): void {
    this.members.update((rows) => rows.filter((_, i) => i !== index));
  }

  protected toggleNight(memberIndex: number, nightIndex: number): void {
    this.members.update((rows) =>
      rows.map((row, i) => {
        if (i !== memberIndex) return row;
        const nights = [...row.nights];
        nights[nightIndex] = !nights[nightIndex];
        return { ...row, nights };
      })
    );
  }

  protected setAllForNight(nightIndex: number, present: boolean): void {
    this.members.update((rows) =>
      rows.map((row) => {
        const nights = [...row.nights];
        nights[nightIndex] = present;
        return { ...row, nights };
      })
    );
  }

  protected isNightFull(nightIndex: number): boolean {
    const rows = this.members();
    return rows.length > 0 && rows.every((row) => row.nights[nightIndex]);
  }

  protected isNightPartial(nightIndex: number): boolean {
    const rows = this.members();
    const presentCount = rows.filter((row) => row.nights[nightIndex]).length;
    return presentCount > 0 && presentCount < rows.length;
  }

  protected shareFor(memberRef: DocumentReference<Member>): number {
    return (
      this.shareResults().find((r) => r.memberRef.eq(memberRef))?.shares ?? 0
    );
  }

  protected amountFor(memberRef: DocumentReference<Member>): number {
    return (
      this.previewSplits().find((s) => s.owedByMemberRef?.eq(memberRef))
        ?.allocatedAmount ?? 0
    );
  }

  #addMember(member: Member): void {
    if (!member.ref) return;
    this.members.update((rows) => [
      ...rows,
      {
        memberRef: member.ref!,
        displayName: member.displayName,
        nights: this.#resizeNights([], this.nightCount()),
      },
    ]);
  }

  #resizeNights(nights: boolean[], count: number): boolean[] {
    const resized = nights.slice(0, count);
    while (resized.length < count) resized.push(true);
    return resized;
  }
}
