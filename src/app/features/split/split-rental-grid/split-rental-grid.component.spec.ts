import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupStore } from '@store/group.store';
import { createMockGroupStore, mockGroup } from '@testing/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { SplitRentalGridComponent } from './split-rental-grid.component';

describe('SplitRentalGridComponent', () => {
  let fixture: ComponentFixture<SplitRentalGridComponent>;
  let component: SplitRentalGridComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    const mockGroupStore = createMockGroupStore();
    mockGroupStore.currentGroup.set(mockGroup({ currencyCode: 'USD' }));

    await TestBed.configureTestingModule({
      imports: [SplitRentalGridComponent],
      providers: [{ provide: GroupStore, useValue: mockGroupStore }],
    }).compileComponents();

    fixture = TestBed.createComponent(SplitRentalGridComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('nightCount', 3);
    fixture.componentRef.setInput('totalAmount', 0);
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('adding participants', () => {
    it('disables Add until a name is typed', () => {
      expect((component as any).canAddParticipant()).toBe(false);
    });

    it('adds a participant with all nights present by default', () => {
      (component as any).newParticipantName = 'Alice';
      (component as any).addParticipant();

      expect(component.participants()).toEqual([
        { name: 'Alice', nights: [true, true, true] },
      ]);
    });

    it('trims whitespace from the name', () => {
      (component as any).newParticipantName = '  Bob  ';
      (component as any).addParticipant();

      expect(component.participants()[0]!.name).toBe('Bob');
    });

    it('clears the input field after adding', () => {
      (component as any).newParticipantName = 'Alice';
      (component as any).addParticipant();

      expect((component as any).newParticipantName).toBe('');
    });

    it('ignores an empty/whitespace-only name', () => {
      (component as any).newParticipantName = '   ';
      (component as any).addParticipant();

      expect(component.participants().length).toBe(0);
    });

    it('rejects a duplicate name, case-insensitively, and reports it via isDuplicateName', () => {
      (component as any).newParticipantName = 'Alice';
      (component as any).addParticipant();

      (component as any).newParticipantName = 'alice';
      expect((component as any).canAddParticipant()).toBe(false);
      expect((component as any).isDuplicateName()).toBe(true);

      (component as any).addParticipant();

      expect(component.participants().length).toBe(1);
    });
  });

  describe('removing participants', () => {
    it('removes by index', () => {
      component.participants.set([
        { name: 'Alice', nights: [true, true, true] },
        { name: 'Bob', nights: [true, true, true] },
      ]);

      (component as any).removeParticipant(0);

      expect(component.participants().length).toBe(1);
      expect(component.participants()[0]!.name).toBe('Bob');
    });
  });

  describe('night toggling', () => {
    beforeEach(() => {
      component.participants.set([
        { name: 'Alice', nights: [true, true, true] },
        { name: 'Bob', nights: [false, true, true] },
      ]);
    });

    it('toggles a single participant/night cell', () => {
      (component as any).toggleNight(0, 1);
      expect(component.participants()[0]!.nights).toEqual([true, false, true]);
    });

    it('setAllForNight sets every participant for that night', () => {
      (component as any).setAllForNight(0, true);
      expect(component.participants()[0]!.nights[0]).toBe(true);
      expect(component.participants()[1]!.nights[0]).toBe(true);
    });

    it('isNightFull/isNightPartial reflect occupancy', () => {
      expect((component as any).isNightFull(0)).toBe(false);
      expect((component as any).isNightPartial(0)).toBe(true);
      expect((component as any).isNightFull(1)).toBe(true);
      expect((component as any).isNightPartial(1)).toBe(false);
    });
  });

  describe('night count resize', () => {
    it('pads new nights as present when night count increases', async () => {
      fixture.componentRef.setInput('nightCount', 2);
      await fixture.whenStable();
      component.participants.set([{ name: 'Alice', nights: [true, false] }]);

      fixture.componentRef.setInput('nightCount', 4);
      await fixture.whenStable();

      expect(component.participants()[0]!.nights).toEqual([
        true,
        false,
        true,
        true,
      ]);
    });

    it('truncates nights when night count decreases', async () => {
      component.participants.set([
        { name: 'Alice', nights: [true, false, true] },
      ]);

      fixture.componentRef.setInput('nightCount', 2);
      await fixture.whenStable();

      expect(component.participants()[0]!.nights).toEqual([true, false]);
    });
  });

  describe('empty night detection', () => {
    it('flags a night with no occupants', () => {
      component.participants.set([
        { name: 'Alice', nights: [true, false, true] },
      ]);

      expect((component as any).emptyNightIndices()).toEqual([1]);
    });

    it('renders the warning message', async () => {
      component.participants.set([
        { name: 'Alice', nights: [true, false, true] },
      ]);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(query('split-empty-nights-warning')).toBeTruthy();
    });

    it('shows no warning when every night has an occupant', async () => {
      component.participants.set([
        { name: 'Alice', nights: [true, true, true] },
      ]);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(query('split-empty-nights-warning')).toBeNull();
    });
  });

  describe('live preview', () => {
    it('computes shares and amounts for a known worked case', async () => {
      // 2 participants, 2 nights: Alice both nights, Bob only night 1.
      // pool = participants(2) * nights(2) = 4.
      // Night 1 (2 occupants): each gets 2/2 = 1.
      // Night 2 (1 occupant, Alice): gets 2/1 = 2.
      // Alice = 1 + 2 = 3 shares (75%); Bob = 1 share (25%).
      fixture.componentRef.setInput('nightCount', 2);
      fixture.componentRef.setInput('totalAmount', 100);
      await fixture.whenStable();

      component.participants.set([
        { name: 'Alice', nights: [true, true] },
        { name: 'Bob', nights: [true, false] },
      ]);

      expect((component as any).shareFor('Alice')).toBeCloseTo(3, 2);
      expect((component as any).shareFor('Bob')).toBeCloseTo(1, 2);
      expect((component as any).amountFor('Alice')).toBe(75);
      expect((component as any).amountFor('Bob')).toBe(25);
      expect((component as any).totalShares()).toBeCloseTo(4, 2);
      expect((component as any).totalPreviewAmount()).toBe(100);
    });

    it('returns zero for shares/amount before any participant is added', () => {
      expect((component as any).shareFor('Nobody')).toBe(0);
      expect((component as any).amountFor('Nobody')).toBe(0);
    });
  });
});
