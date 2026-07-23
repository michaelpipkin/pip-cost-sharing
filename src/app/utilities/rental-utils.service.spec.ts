import { TestBed } from '@angular/core/testing';
import { Category } from '@models/category';
import { RentalDetails } from '@models/expense';
import { DocumentReference } from 'firebase/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { RentalUtilsService } from './rental-utils.service';

function ref(id: string): any {
  return new DocumentReference(id, `groups/g/members/${id}`);
}

function category(name: string): Category {
  return new Category({ id: name, name, active: true, ref: ref(name) });
}

describe('RentalUtilsService', () => {
  let service: RentalUtilsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RentalUtilsService],
    });
    service = TestBed.inject(RentalUtilsService);
  });

  describe('computeShares', () => {
    it('computes the worked example from the docs: 5 people, 4 nights, varying occupancy', () => {
      // Night 0: p1,p2,p3 (3). Nights 1-2: all 5. Night 3: p1,p2,p3,p4 (4).
      const details: RentalDetails = {
        nightCount: 4,
        stays: [
          { memberRef: ref('p1'), nights: [0, 1, 2, 3] },
          { memberRef: ref('p2'), nights: [0, 1, 2, 3] },
          { memberRef: ref('p3'), nights: [0, 1, 2, 3] },
          { memberRef: ref('p4'), nights: [1, 2, 3] },
          { memberRef: ref('p5'), nights: [1, 2] },
        ],
      };

      const result = service.computeShares(details);
      const byId = new Map(result.map((r) => [r.memberRef.id, r.shares]));

      // pool = participantCount(5) * nightCount(4) = 20
      const totalShares = result.reduce((t, r) => t + r.shares, 0);
      expect(totalShares).toBeCloseTo(20, 1);

      // p1 stayed all 4 nights: 5/3 + 5/5 + 5/5 + 5/4 = 1.67 + 1 + 1 + 1.25 = 4.92
      expect(byId.get('p1')).toBeCloseTo(4.92, 2);
      // p5 stayed only nights 1-2 (both full occupancy): 5/5 + 5/5 = 2
      expect(byId.get('p5')).toBeCloseTo(2, 2);
      // p4 stayed nights 1-3: 5/5 + 5/5 + 5/4 = 1 + 1 + 1.25 = 3.25
      expect(byId.get('p4')).toBeCloseTo(3.25, 2);
    });

    it('splits evenly when every participant stays every night', () => {
      const details: RentalDetails = {
        nightCount: 3,
        stays: [
          { memberRef: ref('a'), nights: [0, 1, 2] },
          { memberRef: ref('b'), nights: [0, 1, 2] },
        ],
      };
      const result = service.computeShares(details);
      // pool = 2 * 3 = 6, split evenly => 3 shares each
      expect(result.find((r) => r.memberRef.id === 'a')?.shares).toBe(3);
      expect(result.find((r) => r.memberRef.id === 'b')?.shares).toBe(3);
    });

    it('gives zero shares to a participant who stayed no nights', () => {
      const details: RentalDetails = {
        nightCount: 2,
        stays: [
          { memberRef: ref('a'), nights: [0, 1] },
          { memberRef: ref('b'), nights: [] },
        ],
      };
      const result = service.computeShares(details);
      expect(result.find((r) => r.memberRef.id === 'b')?.shares).toBe(0);
    });

    it('returns zero shares for all when there are no nights', () => {
      const details: RentalDetails = {
        nightCount: 0,
        stays: [{ memberRef: ref('a'), nights: [] }],
      };
      const result = service.computeShares(details);
      expect(result).toEqual([{ memberRef: ref('a'), shares: 0 }]);
    });

    it('returns an empty array when there are no participants', () => {
      const details: RentalDetails = { nightCount: 3, stays: [] };
      expect(service.computeShares(details)).toEqual([]);
    });
  });

  describe('emptyNights', () => {
    it('flags nights with no occupants', () => {
      const details: RentalDetails = {
        nightCount: 3,
        stays: [{ memberRef: ref('a'), nights: [0, 2] }],
      };
      expect(service.emptyNights(details)).toEqual([1]);
    });

    it('returns an empty array when every night has at least one occupant', () => {
      const details: RentalDetails = {
        nightCount: 2,
        stays: [{ memberRef: ref('a'), nights: [0, 1] }],
      };
      expect(service.emptyNights(details)).toEqual([]);
    });
  });

  describe('guessCategory', () => {
    it('picks the highest-priority match, regardless of list order', () => {
      const categories = [
        category('Groceries'),
        category('Rental'),
        category('Travel'),
        category('Utilities'),
      ];
      expect(service.guessCategory(categories)?.name).toBe('Travel');
    });

    it('matches case-insensitively', () => {
      const categories = [category('vacation'), category('Groceries')];
      expect(service.guessCategory(categories)?.name).toBe('vacation');
    });

    it('falls through the priority list to a lower-ranked match', () => {
      const categories = [category('Airbnb'), category('Groceries')];
      expect(service.guessCategory(categories)?.name).toBe('Airbnb');
    });

    it('returns null when nothing matches', () => {
      const categories = [category('Groceries'), category('Utilities')];
      expect(service.guessCategory(categories)).toBeNull();
    });

    it('returns null for an empty category list', () => {
      expect(service.guessCategory([])).toBeNull();
    });
  });
});
