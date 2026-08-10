import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { RentalRoom } from '@models/expense';

/** A participant eligible to be assigned to a room - id + display label. */
export interface RoomParticipant {
  id: string;
  name: string;
}

/**
 * Optional room/rate editor for the Vacation Rental wizard: lets a rental
 * be split unevenly by room (e.g. a master suite paying more than a couch)
 * instead of every occupant of a night paying the same. Deliberately
 * string-keyed (RoomParticipant.id, not DocumentReference<Member>) so it
 * can be reused as-is by the standalone Split Expense calculator later.
 *
 * Assignment is exclusive by construction: `assignments` is a
 * participant-keyed map, so assigning a participant to a room always
 * overwrites whatever room they were in before - there's no way to
 * represent "in two rooms at once".
 */
@Component({
  selector: 'app-rental-rooms',
  templateUrl: './rental-rooms.component.html',
  styleUrl: './rental-rooms.component.scss',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatOptionModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RentalRoomsComponent {
  participants = input<RoomParticipant[]>([]);
  rooms = model<RentalRoom[]>([]);
  /** participantId -> roomId */
  assignments = model<Record<string, string>>({});

  protected readonly unassignedParticipants = computed(() => {
    const assignments = this.assignments();
    return this.participants().filter((p) => !assignments[p.id]);
  });

  protected readonly unassignedNames = computed(() =>
    this.unassignedParticipants()
      .map((p) => p.name)
      .join(', ')
  );

  protected occupantIdsFor(roomId: string): string[] {
    const assignments = this.assignments();
    return this.participants()
      .filter((p) => assignments[p.id] === roomId)
      .map((p) => p.id);
  }

  protected addRoom(): void {
    const id =
      crypto.randomUUID?.() ??
      `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; // NOSONAR
    this.rooms.update((rooms) => [
      ...rooms,
      { id, name: `Room ${rooms.length + 1}`, rate: 1 },
    ]);
  }

  protected removeRoom(roomId: string): void {
    this.rooms.update((rooms) => rooms.filter((r) => r.id !== roomId));
    this.assignments.update((assignments) => {
      const next = { ...assignments };
      for (const [participantId, assignedRoomId] of Object.entries(next)) {
        if (assignedRoomId === roomId) delete next[participantId];
      }
      return next;
    });
  }

  protected updateRoomName(roomId: string, name: string): void {
    this.rooms.update((rooms) =>
      rooms.map((r) => (r.id === roomId ? { ...r, name } : r))
    );
  }

  protected updateRoomRate(roomId: string, value: string): void {
    const parsed = Number(value);
    const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    this.rooms.update((rooms) =>
      rooms.map((r) => (r.id === roomId ? { ...r, rate } : r))
    );
  }

  protected onOccupantsChange(roomId: string, event: MatSelectChange): void {
    const selectedIds = new Set<string>(event.value ?? []);
    this.assignments.update((assignments) => {
      const next = { ...assignments };
      for (const [participantId, assignedRoomId] of Object.entries(next)) {
        if (assignedRoomId === roomId && !selectedIds.has(participantId)) {
          delete next[participantId];
        }
      }
      selectedIds.forEach((id) => {
        next[id] = roomId;
      });
      return next;
    });
  }
}
