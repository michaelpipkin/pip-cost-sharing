import { Injectable, signal } from '@angular/core';
import { Member } from '@models/member';
import { DocumentReference } from 'firebase/firestore';

export interface ReceiptScanSplit {
  memberRef: DocumentReference<Member>;
  assignedAmount: number;
}

export interface ReceiptScanPayload {
  file: File;
  fileName: string;
  totalAmount: number;
  description: string;
  /** Unassigned ("Shared / No one") item total - split evenly across members. */
  sharedAmount: number;
  /** Tax + tip - split proportionally to each member's assigned item total. */
  proportionalAmount: number;
  splits: ReceiptScanSplit[];
}

/**
 * In-memory handoff from the receipt-scan wizard to AddExpenseComponent.
 * Router navigation state can't carry this payload the way
 * SerializableRentalPayload does: DocumentReferences aren't
 * structured-cloneable (see expense.ts), and a multi-MB receipt File risks
 * exceeding browsers' history.pushState size limits. A plain root-provided
 * service sidesteps both, at the cost of only surviving in-memory
 * navigation (not a page reload) - acceptable since this is a same-tab
 * handoff between two adjacent screens.
 */
@Injectable({
  providedIn: 'root',
})
export class ReceiptScanHandoffService {
  #payload = signal<ReceiptScanPayload | null>(null);

  setPayload(payload: ReceiptScanPayload): void {
    this.#payload.set(payload);
  }

  /** Reads and clears the pending payload, if any. */
  takePayload(): ReceiptScanPayload | null {
    const payload = this.#payload();
    this.#payload.set(null);
    return payload;
  }
}
