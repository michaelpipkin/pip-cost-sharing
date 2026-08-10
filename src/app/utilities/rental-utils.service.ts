import { Injectable } from '@angular/core';
import { Category } from '@models/category';
import { RentalDetails, RentalStay } from '@models/expense';
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
 * With no rooms defined, each night distributes a fixed pool of
 * `participantCount` shares evenly among whoever stayed that night, so
 * every night contributes an equal portion of the total pool
 * (participantCount * nightCount) regardless of how many people were
 * actually present - matching an equal per-night cost. A member's total
 * shares are the sum, across the nights they stayed, of
 * `participantCount / occupancyThatNight`.
 *
 * When rooms ARE defined (details.rooms is non-empty), the per-night pool
 * is still divided among that night's occupants, but not evenly - each
 * occupant's slice is weighted by their room's rate, split among however
 * many of that room's occupants are present that night (so a shared room's
 * rate is split only between the roommates actually there). A participant
 * with no roomId is treated as a private room at the standard rate (1.0).
 * The per-night pool of `participantCount` shares is preserved either way,
 * so share totals stay comparable between the two models.
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

    if (details.rooms?.length) {
      return this.#computeWeightedShares(details);
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

  #computeWeightedShares<K>(
    details: RentalDetails<K>
  ): RentalShareResult<K>[] {
    const participantCount = details.stays.length;
    const rateByRoomId = new Map(
      (details.rooms ?? []).map((room) => [
        room.id,
        room.rate > 0 ? room.rate : 1,
      ])
    );

    // How many of each room's occupants are present on each night, so a
    // shared room's rate splits only among the roommates actually there.
    const roomOccupancyByNight: Map<string, number>[] = Array.from(
      { length: details.nightCount },
      () => new Map<string, number>()
    );
    details.stays.forEach((stay) => {
      if (!stay.roomId) return;
      stay.nights.forEach((night) => {
        if (night < 0 || night >= details.nightCount) return;
        const counts = roomOccupancyByNight[night]!;
        counts.set(stay.roomId!, (counts.get(stay.roomId!) ?? 0) + 1);
      });
    });

    const weightFor = (stay: RentalStay<K>, night: number): number => {
      const rate = stay.roomId ? (rateByRoomId.get(stay.roomId) ?? 1) : 1;
      if (!stay.roomId) return rate;
      const roommatesPresent =
        roomOccupancyByNight[night]?.get(stay.roomId) ?? 1;
      return rate / roommatesPresent;
    };

    const weightPoolByNight = new Array<number>(details.nightCount).fill(0);
    details.stays.forEach((stay) => {
      stay.nights.forEach((night) => {
        if (night < 0 || night >= details.nightCount) return;
        weightPoolByNight[night]! += weightFor(stay, night);
      });
    });

    return details.stays.map((stay) => {
      const shares = stay.nights.reduce((total, night) => {
        if (night < 0 || night >= details.nightCount) return total;
        const pool = weightPoolByNight[night];
        if (!pool) return total;
        return total + (participantCount * weightFor(stay, night)) / pool;
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
