import { Injectable } from '@angular/core';
import { RentalDetails } from '@models/expense';
import { Member } from '@models/member';
import { DocumentReference } from 'firebase/firestore';

export interface RentalShareResult {
  memberRef: DocumentReference<Member>;
  shares: number;
}

/**
 * Computes vacation-rental share allocations for the shares split method.
 *
 * Each night distributes a fixed pool of `participantCount` shares evenly
 * among whoever stayed that night, so every night contributes an equal
 * portion of the total pool (participantCount * nightCount) regardless of
 * how many people were actually present - matching an equal per-night cost.
 * A member's total shares are the sum, across the nights they stayed, of
 * `participantCount / occupancyThatNight`.
 *
 * The resulting per-member shares are handed to
 * AllocationUtilsService.allocateByShares() for the actual currency
 * conversion, so rounding here only affects the displayed share count -
 * never the saved dollar amounts.
 */
@Injectable({
  providedIn: 'root',
})
export class RentalUtilsService {
  computeShares(details: RentalDetails): RentalShareResult[] {
    const participantCount = details.stays.length;
    if (participantCount === 0 || details.nightCount <= 0) {
      return details.stays.map((stay) => ({
        memberRef: stay.memberRef,
        shares: 0,
      }));
    }

    const occupancy = this.#occupancyByNight(details);

    return details.stays.map((stay) => {
      const shares = stay.nights.reduce((total, night) => {
        const occupantsThatNight = occupancy[night];
        if (!occupantsThatNight) return total;
        return total + participantCount / occupantsThatNight;
      }, 0);
      return {
        memberRef: stay.memberRef,
        shares: Math.round(shares * 100) / 100,
      };
    });
  }

  /**
   * Nights with zero occupants can't be allocated a share of the cost.
   * Callers should surface this to the user rather than saving the expense.
   */
  emptyNights(details: RentalDetails): number[] {
    if (details.nightCount <= 0) return [];
    const occupancy = this.#occupancyByNight(details);
    return occupancy
      .map((count, night) => (count === 0 ? night : -1))
      .filter((night) => night >= 0);
  }

  #occupancyByNight(details: RentalDetails): number[] {
    const occupancy = new Array<number>(details.nightCount).fill(0);
    details.stays.forEach((stay) => {
      stay.nights.forEach((night) => {
        if (night >= 0 && night < details.nightCount) {
          occupancy[night]!++;
        }
      });
    });
    return occupancy;
  }
}
