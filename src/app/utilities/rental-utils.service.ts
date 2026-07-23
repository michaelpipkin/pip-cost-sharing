import { Injectable } from '@angular/core';
import { Category } from '@models/category';
import { RentalDetails } from '@models/expense';
import { Member } from '@models/member';
import { DocumentReference } from 'firebase/firestore';

export interface RentalShareResult<K = DocumentReference<Member>> {
  memberRef: K;
  shares: number;
}

/**
 * Category names to look for (case-insensitive, exact match) when guessing
 * a category for a vacation rental expense, in priority order.
 */
export const RENTAL_CATEGORY_NAME_PRIORITY: readonly string[] = [
  'Travel',
  'Vacation',
  'Hotel',
  'Rental',
  'Lodging',
  'Accommodation',
  'Airbnb',
  'VRBO',
  'Trip',
];

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
  computeShares<K = DocumentReference<Member>>(
    details: RentalDetails<K>
  ): RentalShareResult<K>[] {
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
  emptyNights<K = DocumentReference<Member>>(details: RentalDetails<K>): number[] {
    if (details.nightCount <= 0) return [];
    const occupancy = this.#occupancyByNight(details);
    return occupancy
      .map((count, night) => (count === 0 ? night : -1))
      .filter((night) => night >= 0);
  }

  /**
   * Guesses a category for a vacation rental expense by looking for an
   * exact, case-insensitive match against RENTAL_CATEGORY_NAME_PRIORITY,
   * checked in that order. Returns null if none of the group's categories
   * match, leaving the field for the user to fill in as usual.
   */
  guessCategory(categories: Category[]): Category | null {
    for (const name of RENTAL_CATEGORY_NAME_PRIORITY) {
      const match = categories.find(
        (c) => c.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (match) return match;
    }
    return null;
  }

  #occupancyByNight<K>(details: RentalDetails<K>): number[] {
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
