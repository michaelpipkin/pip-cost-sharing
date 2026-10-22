import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RentalRoom } from '@models/expense';
import { Member } from '@models/member';
import { LocaleService } from '@services/locale.service';
import { GroupStore } from '@store/group.store';
import {
  createMockGroupStore,
  mockDocRef,
  mockGroup,
  mockMember,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RentalGridComponent,
  RentalMemberRow,
} from './rental-grid.component';

describe('RentalGridComponent', () => {
  let fixture: ComponentFixture<RentalGridComponent>;
  let component: RentalGridComponent;
  let el: HTMLElement;

  const alice = mockMember({
    id: 'alice',
    displayName: 'Alice',
    ref: mockDocRef('groups/group-1/members/alice'),
  });
  const bob = mockMember({
    id: 'bob',
    displayName: 'Bob',
    ref: mockDocRef('groups/group-1/members/bob'),
  });
  const carol = mockMember({
    id: 'carol',
    displayName: 'Carol',
    ref: mockDocRef('groups/group-1/members/carol'),
  });
  const available: Member[] = [alice, bob, carol];

  const row = (member: Member, nights: boolean[]): RentalMemberRow => ({
    memberRef: member.ref!,
    displayName: member.displayName,
    nights,
  });

  const big: RentalRoom = { id: 'room-big', name: 'Master Suite', rate: 3 };
  const small: RentalRoom = { id: 'room-small', name: 'Bunk Room', rate: 1 };

  beforeEach(async () => {
    const mockGroupStore = createMockGroupStore();
    mockGroupStore.currentGroup.set(mockGroup({ currencyCode: 'USD' }));

    await TestBed.configureTestingModule({
      imports: [RentalGridComponent],
      providers: [
        { provide: GroupStore, useValue: mockGroupStore },
        LocaleService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RentalGridComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('availableMembers', available);
    fixture.componentRef.setInput('nightCount', 3);
    fixture.componentRef.setInput('totalAmount', 0);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  const nightsOf = () => component.members().map((r) => r.nights);
  const names = () => component.members().map((r) => r.displayName);
  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  async function setMembers(rows: RentalMemberRow[]) {
    component.members.set(rows);
    await fixture.whenStable();
  }

  describe('night count resize', () => {
    it('pads every row with true when the night count grows from 3 to 5', async () => {
      await setMembers([
        row(alice, [true, false, true]),
        row(bob, [false, false, true]),
      ]);

      fixture.componentRef.setInput('nightCount', 5);
      await fixture.whenStable();

      expect(nightsOf()).toEqual([
        [true, false, true, true, true],
        [false, false, true, true, true],
      ]);
    });

    it('truncates every row when the night count shrinks from 5 to 2', async () => {
      fixture.componentRef.setInput('nightCount', 5);
      await fixture.whenStable();
      await setMembers([
        row(alice, [true, false, true, false, true]),
        row(bob, [false, true, true, true, false]),
      ]);

      fixture.componentRef.setInput('nightCount', 2);
      await fixture.whenStable();

      expect(nightsOf()).toEqual([
        [true, false],
        [false, true],
      ]);
    });

    it('renders one column per night', async () => {
      await setMembers([row(alice, [true, true, true])]);
      expect(el.querySelectorAll('[data-testid="night-checkbox"]').length).toBe(
        3
      );

      fixture.componentRef.setInput('nightCount', 5);
      await fixture.whenStable();

      expect(el.querySelectorAll('[data-testid="night-checkbox"]').length).toBe(
        5
      );
    });
  });

  describe('adding members', () => {
    it('adds the selected member with every night present and clears the selection', () => {
      (component as any).selectedMemberToAdd = bob.ref;

      (component as any).addSelectedMember();

      expect(component.members()).toEqual([
        {
          memberRef: bob.ref,
          displayName: 'Bob',
          nights: [true, true, true],
        },
      ]);
      expect((component as any).selectedMemberToAdd).toBeNull();
    });

    it('does nothing when no member is selected', () => {
      (component as any).selectedMemberToAdd = null;

      (component as any).addSelectedMember();

      expect(component.members()).toEqual([]);
    });

    it('does nothing when the selected ref is not an available member', () => {
      (component as any).selectedMemberToAdd = mockDocRef(
        'groups/group-1/members/stranger'
      );

      (component as any).addSelectedMember();

      expect(component.members()).toEqual([]);
    });

    it('adds all remaining members, leaving rows already present untouched', async () => {
      await setMembers([row(bob, [false, true, false])]);

      (component as any).addAllRemainingMembers();

      expect(names()).toEqual(['Bob', 'Alice', 'Carol']);
      expect(nightsOf()).toEqual([
        [false, true, false],
        [true, true, true],
        [true, true, true],
      ]);
    });

    it('adds all remaining members through the Add All Members button', async () => {
      (
        el.querySelector(
          '[data-testid="add-all-members-button"]'
        ) as HTMLButtonElement
      ).click();
      await fixture.whenStable();

      expect(names()).toEqual(['Alice', 'Bob', 'Carol']);
      expect(el.querySelectorAll('[data-testid="member-row"]').length).toBe(3);
    });

    it('remainingMembers excludes members already in the grid', async () => {
      expect((component as any).remainingMembers()).toEqual(available);

      await setMembers([row(alice, [true, true, true])]);
      expect(
        (component as any).remainingMembers().map((m: Member) => m.id)
      ).toEqual(['bob', 'carol']);

      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, true]),
        row(carol, [true, true, true]),
      ]);
      expect((component as any).remainingMembers()).toEqual([]);
    });

    it('hides the add controls once every member is in the grid', async () => {
      expect(el.querySelector('[data-testid="add-member-select"]')).toBeTruthy();

      (component as any).addAllRemainingMembers();
      await fixture.whenStable();

      expect(el.querySelector('[data-testid="add-member-select"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="add-all-members-button"]')
      ).toBeNull();
    });
  });

  describe('removeMember and toggleNight', () => {
    beforeEach(async () => {
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, false, true]),
        row(carol, [false, false, true]),
      ]);
    });

    it('removeMember removes only the row at that index', () => {
      (component as any).removeMember(1);

      expect(names()).toEqual(['Alice', 'Carol']);
      expect(nightsOf()).toEqual([
        [true, true, true],
        [false, false, true],
      ]);
    });

    it('toggleNight flips only the target member and night', () => {
      (component as any).toggleNight(1, 1);

      expect(nightsOf()).toEqual([
        [true, true, true],
        [true, true, true],
        [false, false, true],
      ]);

      (component as any).toggleNight(1, 1);

      expect(nightsOf()[1]).toEqual([true, false, true]);
    });

    it('toggleNight does not mutate the previous row arrays', () => {
      const before = component.members();
      (component as any).toggleNight(0, 0);

      expect(before[0]!.nights).toEqual([true, true, true]);
      expect(component.members()[0]!.nights).toEqual([false, true, true]);
    });

    it('removes a row through its delete button', async () => {
      (
        el.querySelectorAll(
          '[data-testid="remove-member-button"]'
        )[2] as HTMLButtonElement
      ).click();
      await fixture.whenStable();

      expect(names()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('setAllForNight', () => {
    beforeEach(async () => {
      await setMembers([
        row(alice, [true, false, true]),
        row(bob, [false, false, true]),
      ]);
    });

    it('sets every member present for that night only', () => {
      (component as any).setAllForNight(0, true);

      expect(nightsOf()).toEqual([
        [true, false, true],
        [true, false, true],
      ]);
    });

    it('clears every member for that night only', () => {
      (component as any).setAllForNight(2, false);

      expect(nightsOf()).toEqual([
        [true, false, false],
        [false, false, false],
      ]);
    });
  });

  describe('isNightFull and isNightPartial', () => {
    it('are both false when there are no members', () => {
      expect((component as any).isNightFull(0)).toBe(false);
      expect((component as any).isNightPartial(0)).toBe(false);
    });

    it('reports full, partial and empty nights', async () => {
      await setMembers([
        row(alice, [true, true, false]),
        row(bob, [false, true, false]),
      ]);

      // night 0: only Alice
      expect((component as any).isNightFull(0)).toBe(false);
      expect((component as any).isNightPartial(0)).toBe(true);
      // night 1: both
      expect((component as any).isNightFull(1)).toBe(true);
      expect((component as any).isNightPartial(1)).toBe(false);
      // night 2: nobody
      expect((component as any).isNightFull(2)).toBe(false);
      expect((component as any).isNightPartial(2)).toBe(false);
    });
  });

  describe('occupancy and empty nights', () => {
    beforeEach(async () => {
      fixture.componentRef.setInput('nightCount', 5);
      await fixture.whenStable();
    });

    it('counts present members per night', async () => {
      await setMembers([
        row(alice, [true, false, true, false, true]),
        row(bob, [true, false, true, false, false]),
        row(carol, [true, false, false, false, false]),
      ]);

      expect((component as any).occupancyByNight()).toEqual([3, 0, 2, 0, 1]);
    });

    it("labels empty nights 1-based as '2, 4'", async () => {
      await setMembers([
        row(alice, [true, false, true, false, true]),
        row(bob, [true, false, true, false, false]),
      ]);

      expect((component as any).emptyNightIndices()).toEqual([1, 3]);
      expect((component as any).emptyNightLabel()).toBe('2, 4');
      expect(text('empty-nights-warning')).toContain('nights 2, 4');
    });

    it('uses the singular for one empty night', async () => {
      await setMembers([row(alice, [true, true, false, true, true])]);

      expect((component as any).emptyNightLabel()).toBe('3');
      expect(text('empty-nights-warning')).toContain('night 3.');
      expect(text('empty-nights-warning')).not.toContain('nights');
    });

    it('shows no warning when every night is occupied', async () => {
      await setMembers([row(alice, [true, true, true, true, true])]);

      expect((component as any).emptyNightLabel()).toBe('');
      expect(el.querySelector('[data-testid="empty-nights-warning"]')).toBeNull();
    });
  });

  describe('shares and preview', () => {
    it('is empty with no members', () => {
      fixture.componentRef.setInput('totalAmount', 100);

      expect((component as any).previewSplits()).toEqual([]);
      expect((component as any).totalPreviewAmount()).toBe(0);
      expect((component as any).totalShares()).toBe(0);
    });

    it('splits 100 over shares 2:1 into 66.67 and 33.33 totalling 100', async () => {
      // 3 nights, no rooms. Night 1 and 2 have both members: pool 2, so
      // 1 share each. Night 3 has only Alice: she takes the pool of 2.
      // Alice = 1 + 1 + 2 = 4 shares, Bob = 1 + 1 = 2 shares (4:2 = 2:1).
      fixture.componentRef.setInput('totalAmount', 100);
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, false]),
      ]);

      expect((component as any).shareFor(alice.ref)).toBe(4);
      expect((component as any).shareFor(bob.ref)).toBe(2);
      expect((component as any).totalShares()).toBe(6);
      expect((component as any).amountFor(alice.ref)).toBe(66.67);
      expect((component as any).amountFor(bob.ref)).toBe(33.33);
      expect((component as any).totalPreviewAmount()).toBe(100);
    });

    it('renders the shares and amounts in the group currency', async () => {
      fixture.componentRef.setInput('totalAmount', 100);
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, false]),
      ]);

      const cells = (id: string) =>
        Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((c) =>
          c.textContent?.trim()
        );
      expect(cells('member-shares')).toEqual(['4.00', '2.00']);
      expect(cells('member-amount')).toEqual(['$ 66.67', '$ 33.33']);
      expect(text('total-shares')).toBe('6.00');
      expect(text('total-amount')).toBe('$ 100.00');
    });

    it('keeps the preview total equal to the amount when it does not divide evenly', async () => {
      // Three equal shares of 100.00 -> 33.33 x 3 = 99.99, so one gets the extra cent.
      fixture.componentRef.setInput('totalAmount', 100);
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, true]),
        row(carol, [true, true, true]),
      ]);

      expect((component as any).totalPreviewAmount()).toBeCloseTo(100, 2);
      const amounts = (component as any)
        .previewSplits()
        .map((s: { allocatedAmount: number }) => s.allocatedAmount)
        .sort((a: number, b: number) => a - b);
      expect(amounts[0]).toBe(33.33);
      expect(amounts[1]).toBe(33.33);
      expect(amounts[2]).toBeCloseTo(33.34, 2);
    });

    // BUG: src/app/utilities/allocation-utils.service.ts:240 adds the leftover
    // cent with `allocatedAmount += increment` and never re-rounds, so the
    // cent-adjusted split is 33.339999999999996, not 33.34 (Phase B item).
    it.fails('gives the cent-adjusted split an exact currency amount', async () => {
      fixture.componentRef.setInput('totalAmount', 100);
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, true]),
        row(carol, [true, true, true]),
      ]);

      const amounts = (component as any)
        .previewSplits()
        .map((s: { allocatedAmount: number }) => s.allocatedAmount)
        .sort((a: number, b: number) => a - b);
      expect(amounts).toEqual([33.33, 33.33, 33.34]);
    });

    it('returns zero share and amount for a member not in the grid', async () => {
      fixture.componentRef.setInput('totalAmount', 100);
      await setMembers([row(alice, [true, true, true])]);

      expect((component as any).shareFor(bob.ref)).toBe(0);
      expect((component as any).amountFor(bob.ref)).toBe(0);
    });

    it('updates the preview when the total amount changes', async () => {
      await setMembers([
        row(alice, [true, true, true]),
        row(bob, [true, true, false]),
      ]);

      fixture.componentRef.setInput('totalAmount', 300);
      await fixture.whenStable();

      expect((component as any).amountFor(alice.ref)).toBe(200);
      expect((component as any).amountFor(bob.ref)).toBe(100);
    });
  });

  describe('room assignments', () => {
    beforeEach(async () => {
      // 1 night, two members. Master Suite (rate 3) vs Bunk Room (rate 1):
      // pool = 4, so Alice = 2 * 3 / 4 = 1.5 shares, Bob = 2 * 1 / 4 = 0.5.
      fixture.componentRef.setInput('nightCount', 1);
      fixture.componentRef.setInput('totalAmount', 100);
      fixture.componentRef.setInput('rooms', [big, small]);
      fixture.componentRef.setInput('roomAssignments', {
        alice: big.id,
        bob: small.id,
      });
      await fixture.whenStable();
      await setMembers([row(alice, [true]), row(bob, [true])]);
    });

    it('derives shares from the assigned room rates', () => {
      expect((component as any).shareFor(alice.ref)).toBe(1.5);
      expect((component as any).shareFor(bob.ref)).toBe(0.5);
      expect((component as any).amountFor(alice.ref)).toBe(75);
      expect((component as any).amountFor(bob.ref)).toBe(25);
    });

    it('recomputes shares when the assignments change', async () => {
      fixture.componentRef.setInput('roomAssignments', {
        alice: small.id,
        bob: big.id,
      });
      await fixture.whenStable();

      expect((component as any).shareFor(alice.ref)).toBe(0.5);
      expect((component as any).shareFor(bob.ref)).toBe(1.5);
      expect((component as any).amountFor(alice.ref)).toBe(25);
      expect((component as any).amountFor(bob.ref)).toBe(75);
    });

    it('splits a shared room rate between the roommates present', async () => {
      // Alice and Bob share the Master Suite (rate 3 -> 1.5 each); Carol is in
      // the Bunk Room (1). Pool = 4, participants = 3:
      // Alice = Bob = 3 * 1.5 / 4 = 1.125 -> 1.13 (rounded); Carol = 3 / 4 = 0.75.
      fixture.componentRef.setInput('roomAssignments', {
        alice: big.id,
        bob: big.id,
        carol: small.id,
      });
      await setMembers([
        row(alice, [true]),
        row(bob, [true]),
        row(carol, [true]),
      ]);

      expect((component as any).shareFor(alice.ref)).toBe(1.13);
      expect((component as any).shareFor(bob.ref)).toBe(1.13);
      expect((component as any).shareFor(carol.ref)).toBe(0.75);
    });

    it('roomNameFor returns the assigned room name', () => {
      expect((component as any).roomNameFor(alice.ref)).toBe('Master Suite');
      expect((component as any).roomNameFor(bob.ref)).toBe('Bunk Room');
    });

    it('roomNameFor is null for a member with no assignment', () => {
      expect((component as any).roomNameFor(carol.ref)).toBeNull();
    });

    it('roomNameFor is null when the assigned room does not exist', async () => {
      fixture.componentRef.setInput('roomAssignments', {
        alice: 'room-deleted',
      });
      await fixture.whenStable();

      expect((component as any).roomNameFor(alice.ref)).toBeNull();
    });
  });
});
