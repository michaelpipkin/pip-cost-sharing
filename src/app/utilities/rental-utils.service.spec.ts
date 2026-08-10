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

    it('an empty rooms array behaves identically to no rooms at all', () => {
      const details: RentalDetails = {
        nightCount: 3,
        stays: [
          { memberRef: ref('a'), nights: [0, 1, 2] },
          { memberRef: ref('b'), nights: [0, 1, 2] },
        ],
        rooms: [],
      };
      const result = service.computeShares(details);
      expect(result.find((r) => r.memberRef.id === 'a')?.shares).toBe(3);
      expect(result.find((r) => r.memberRef.id === 'b')?.shares).toBe(3);
    });

    it('weights a private master suite against a shared bedroom (worked example)', () => {
      // 3 people, 1 night, $250 total (dollars asserted via the docstring
      // example, not here - this asserts the share ratio, which is what
      // AllocationUtilsService.allocateByShares turns into 150/50/50).
      const details: RentalDetails = {
        nightCount: 1,
        stays: [
          { memberRef: ref('alice'), nights: [0], roomId: 'master' },
          { memberRef: ref('bob'), nights: [0], roomId: 'bedroom' },
          { memberRef: ref('carol'), nights: [0], roomId: 'bedroom' },
        ],
        rooms: [
          { id: 'master', name: 'Master Suite', rate: 1.5 },
          { id: 'bedroom', name: 'Bedroom 2', rate: 1.0 },
        ],
      };
      const result = service.computeShares(details);
      const byId = new Map(result.map((r) => [r.memberRef.id, r.shares]));

      // pool is still preserved: participantCount(3) * nightCount(1) = 3
      const totalShares = result.reduce((t, r) => t + r.shares, 0);
      expect(totalShares).toBeCloseTo(3, 2);

      expect(byId.get('alice')).toBeCloseTo(1.8, 2);
      expect(byId.get('bob')).toBeCloseTo(0.6, 2);
      expect(byId.get('carol')).toBeCloseTo(0.6, 2);
    });

    it('produces the same result as the unweighted model when every room rate is 1.0', () => {
      const unweighted: RentalDetails = {
        nightCount: 3,
        stays: [
          { memberRef: ref('a'), nights: [0, 1, 2] },
          { memberRef: ref('b'), nights: [0, 1, 2] },
        ],
      };
      const weighted: RentalDetails = {
        nightCount: 3,
        stays: [
          { memberRef: ref('a'), nights: [0, 1, 2], roomId: 'r1' },
          { memberRef: ref('b'), nights: [0, 1, 2], roomId: 'r2' },
        ],
        rooms: [
          { id: 'r1', name: 'Room 1', rate: 1.0 },
          { id: 'r2', name: 'Room 2', rate: 1.0 },
        ],
      };
      expect(service.computeShares(weighted)).toEqual(
        service.computeShares(unweighted)
      );
    });

    it('gives a roommate the room\'s full rate on a night their roommate is absent', () => {
      // Bob and Carol share a bedroom (rate 1.0) across 2 nights, but Carol
      // is away night 1 - Bob should carry the full bedroom rate that
      // night instead of splitting it, since he has the room to himself.
      const details: RentalDetails = {
        nightCount: 2,
        stays: [
          { memberRef: ref('bob'), nights: [0, 1], roomId: 'bedroom' },
          { memberRef: ref('carol'), nights: [0], roomId: 'bedroom' },
        ],
        rooms: [{ id: 'bedroom', name: 'Bedroom', rate: 1.0 }],
      };
      const result = service.computeShares(details);
      const byId = new Map(result.map((r) => [r.memberRef.id, r.shares]));

      // Night 0: shared 1.0/2 each => pool 1.0, so each takes 2*0.5/1.0 = 1.
      // Night 1: Bob alone in the room => weight 1.0, pool 1.0 => 2*1/1 = 2.
      expect(byId.get('bob')).toBeCloseTo(3, 2);
      expect(byId.get('carol')).toBeCloseTo(1, 2);
    });

    it('treats a non-positive or missing room rate as the standard rate (1.0)', () => {
      const details: RentalDetails = {
        nightCount: 1,
        stays: [
          { memberRef: ref('a'), nights: [0], roomId: 'zero-rate' },
          { memberRef: ref('b'), nights: [0], roomId: 'unknown-room' },
          { memberRef: ref('c'), nights: [0] },
        ],
        rooms: [{ id: 'zero-rate', name: 'Broken Room', rate: 0 }],
      };
      const result = service.computeShares(details);
      const byId = new Map(result.map((r) => [r.memberRef.id, r.shares]));

      // All three effectively rate 1.0 with no roommates => splits evenly.
      expect(byId.get('a')).toBeCloseTo(1, 2);
      expect(byId.get('b')).toBeCloseTo(1, 2);
      expect(byId.get('c')).toBeCloseTo(1, 2);
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
