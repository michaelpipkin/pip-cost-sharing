import { TestBed } from '@angular/core/testing';
import { mockDocRef } from '@testing/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ReceiptScanHandoffService,
  ReceiptScanPayload,
} from './receipt-scan-handoff.service';

describe('ReceiptScanHandoffService', () => {
  let service: ReceiptScanHandoffService;

  function buildPayload(): ReceiptScanPayload {
    return {
      file: new File(['bytes'], 'receipt.jpg', { type: 'image/jpeg' }),
      fileName: 'receipt.jpg',
      totalAmount: 42.5,
      description: 'Coffee Shop',
      sharedAmount: 5,
      proportionalAmount: 3.5,
      splits: [
        {
          memberRef: mockDocRef('groups/group-1/members/member-1'),
          assignedAmount: 37.5,
        },
      ],
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReceiptScanHandoffService);
  });

  it('returns null when no payload has been set', () => {
    expect(service.takePayload()).toBeNull();
  });

  it('returns the payload set via setPayload', () => {
    const payload = buildPayload();
    service.setPayload(payload);
    expect(service.takePayload()).toEqual(payload);
  });

  it('clears the payload after it is taken', () => {
    service.setPayload(buildPayload());
    service.takePayload();
    expect(service.takePayload()).toBeNull();
  });
});
