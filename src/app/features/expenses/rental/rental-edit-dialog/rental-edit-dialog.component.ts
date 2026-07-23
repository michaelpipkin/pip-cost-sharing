import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RentalDetails } from '@models/expense';
import { Member } from '@models/member';
import { RentalUtilsService } from '@utils/rental-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import {
  RentalGridComponent,
  RentalMemberRow,
} from '../rental-grid/rental-grid.component';

export interface RentalEditDialogData {
  rental: RentalDetails;
  totalAmount: number;
  /** Members eligible as members - active members plus anyone already in the rental. */
  availableMembers: Member[];
}

export interface RentalEditDialogResult {
  rental: RentalDetails;
}

/**
 * Dialog wrapper around the shared occupancy grid, used from Edit Expense
 * to let a saved vacation rental expense's per-night occupancy be adjusted
 * (e.g. someone joins the trip after the fact) without a second full wizard
 * page. The caller recomputes shares from the returned RentalDetails.
 */
@Component({
  selector: 'app-rental-edit-dialog',
  templateUrl: './rental-edit-dialog.component.html',
  styleUrl: './rental-edit-dialog.component.scss',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    CurrencyPipe,
    RentalGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalEditDialogComponent {
  protected readonly data: RentalEditDialogData = inject(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(
    MatDialogRef<RentalEditDialogComponent, RentalEditDialogResult>
  );
  protected readonly stringUtils = inject(StringUtils);
  protected readonly rentalUtils = inject(RentalUtilsService);

  protected readonly nightCount = signal<number>(this.data.rental.nightCount);
  protected readonly members = signal<RentalMemberRow[]>(
    this.#buildInitialMembers()
  );

  protected readonly rentalDetails = computed<RentalDetails>(() => ({
    nightCount: this.nightCount(),
    stays: this.members().map((p) => ({
      memberRef: p.memberRef,
      nights: p.nights
        .map((present, i) => (present ? i : -1))
        .filter((i) => i >= 0),
    })),
  }));

  protected readonly emptyNightIndices = computed(() =>
    this.rentalUtils.emptyNights(this.rentalDetails())
  );

  protected readonly canSave = computed(
    () =>
      this.nightCount() >= 1 &&
      this.members().length > 0 &&
      this.emptyNightIndices().length === 0
  );

  onNightCountInput(value: string): void {
    const parsed = Math.max(1, Math.round(this.stringUtils.toNumber(value)));
    this.nightCount.set(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  }

  onSave(): void {
    if (!this.canSave()) return;
    this.dialogRef.close({ rental: this.rentalDetails() });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  #buildInitialMembers(): RentalMemberRow[] {
    const { nightCount, stays } = this.data.rental;
    return stays.map((stay) => {
      const member = this.data.availableMembers.find((m) =>
        m.ref?.eq(stay.memberRef)
      );
      const nights = new Array<boolean>(nightCount).fill(false);
      stay.nights.forEach((n) => {
        if (n >= 0 && n < nightCount) nights[n] = true;
      });
      return {
        memberRef: stay.memberRef,
        displayName: member?.displayName ?? '(former member)',
        nights,
      };
    });
  }
}
