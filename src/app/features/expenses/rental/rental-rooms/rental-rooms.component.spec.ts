import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RentalRoomsComponent,
  RoomParticipant,
} from './rental-rooms.component';

describe('RentalRoomsComponent', () => {
  let fixture: ComponentFixture<RentalRoomsComponent>;
  let component: RentalRoomsComponent;
  let el: HTMLElement;

  const participants: RoomParticipant[] = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
    { id: 'carol', name: 'Carol' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RentalRoomsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RentalRoomsComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.componentRef.setInput('participants', participants);
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function queryAll(testId: string): NodeListOf<HTMLElement> {
    return el.querySelectorAll(`[data-testid="${testId}"]`);
  }

  describe('adding and removing rooms', () => {
    it('starts with no rooms', () => {
      expect(component.rooms()).toEqual([]);
    });

    it('adds a room with a default name and rate 1', () => {
      (component as any).addRoom();

      expect(component.rooms()).toHaveLength(1);
      expect(component.rooms()[0]!.rate).toBe(1);
      expect(component.rooms()[0]!.name).toBeTruthy();
    });

    it('assigns a unique id to each added room', () => {
      (component as any).addRoom();
      (component as any).addRoom();

      const ids = component.rooms().map((r) => r.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('removes a room by id and clears its assignments', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;
      component.assignments.set({ alice: roomId });

      (component as any).removeRoom(roomId);

      expect(component.rooms()).toHaveLength(0);
      expect(component.assignments()).toEqual({});
    });

    it('removing one room leaves other rooms and their assignments intact', () => {
      (component as any).addRoom();
      (component as any).addRoom();
      const [roomA, roomB] = component.rooms();
      component.assignments.set({ alice: roomA!.id, bob: roomB!.id });

      (component as any).removeRoom(roomA!.id);

      expect(component.rooms()).toHaveLength(1);
      expect(component.rooms()[0]!.id).toBe(roomB!.id);
      expect(component.assignments()).toEqual({ bob: roomB!.id });
    });
  });

  describe('editing a room', () => {
    it('updates the room name', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;

      (component as any).updateRoomName(roomId, 'Master Suite');

      expect(component.rooms()[0]!.name).toBe('Master Suite');
    });

    it('updates the room rate from a valid numeric string', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;

      (component as any).updateRoomRate(roomId, '1.5');

      expect(component.rooms()[0]!.rate).toBe(1.5);
    });

    it('falls back to rate 1 for a non-positive or invalid rate entry', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;

      (component as any).updateRoomRate(roomId, '0');
      expect(component.rooms()[0]!.rate).toBe(1);

      (component as any).updateRoomRate(roomId, 'not a number');
      expect(component.rooms()[0]!.rate).toBe(1);
    });
  });

  describe('occupant assignment', () => {
    it('assigns selected participants to a room', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;

      (component as any).onOccupantsChange(roomId, {
        value: ['alice', 'bob'],
      });

      expect(component.assignments()).toEqual({
        alice: roomId,
        bob: roomId,
      });
    });

    it('deselecting a participant clears their assignment to that room', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;
      component.assignments.set({ alice: roomId, bob: roomId });

      (component as any).onOccupantsChange(roomId, { value: ['alice'] });

      expect(component.assignments()).toEqual({ alice: roomId });
    });

    it('assigning a participant to a second room removes them from the first (exclusive assignment)', () => {
      (component as any).addRoom();
      (component as any).addRoom();
      const [roomA, roomB] = component.rooms();
      component.assignments.set({ alice: roomA!.id });

      (component as any).onOccupantsChange(roomB!.id, { value: ['alice'] });

      expect(component.assignments()).toEqual({ alice: roomB!.id });
    });

    it('occupantIdsFor reflects only participants currently assigned to that room', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;
      component.assignments.set({ alice: roomId, bob: 'some-other-room' });

      expect((component as any).occupantIdsFor(roomId)).toEqual(['alice']);
    });
  });

  describe('unassigned participants', () => {
    it('lists every participant as unassigned when no rooms exist', () => {
      expect((component as any).unassignedParticipants()).toHaveLength(3);
    });

    it('excludes assigned participants from the unassigned list', () => {
      (component as any).addRoom();
      const roomId = component.rooms()[0]!.id;
      component.assignments.set({ alice: roomId });

      const remaining = (component as any)
        .unassignedParticipants()
        .map((p: RoomParticipant) => p.id);
      expect(remaining).toEqual(['bob', 'carol']);
    });
  });

  describe('template', () => {
    it('renders one room-row per room', async () => {
      (component as any).addRoom();
      (component as any).addRoom();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(queryAll('room-row')).toHaveLength(2);
    });

    it('shows the unassigned-participants note only when rooms exist and someone is unassigned', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(query('unassigned-participants-note')).toBeNull();

      (component as any).addRoom();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(query('unassigned-participants-note')).toBeTruthy();
    });
  });
});
