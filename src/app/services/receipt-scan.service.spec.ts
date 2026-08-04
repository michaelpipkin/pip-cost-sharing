import { TestBed } from '@angular/core/testing';
import * as functionsModule from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptScanService } from './receipt-scan.service';

describe('ReceiptScanService', () => {
  let service: ReceiptScanService;
  let scanReceiptFn: ReturnType<typeof vi.fn>;
  const mockFunctions = {};
  const mockParsed = {
    total: 12.34,
    subtotal: 11.0,
    tax: 1.34,
    tip: null,
    lineItems: [{ description: 'Coffee', amount: 4.5, confidence: 92 }],
    rawText: 'Coffee Shop\nCoffee 4.50',
  };

  beforeEach(() => {
    vi.spyOn(functionsModule, 'getFunctions').mockReturnValue(
      mockFunctions as any
    );
    scanReceiptFn = vi.fn().mockResolvedValue({ data: mockParsed });
    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
      scanReceiptFn as any
    );

    TestBed.configureTestingModule({
      providers: [
        ReceiptScanService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
      ],
    });
    service = TestBed.inject(ReceiptScanService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the scanReceipt cloud function with the group id and base64 image', async () => {
    const file = new File(['fake-image-bytes'], 'receipt.jpg', {
      type: 'image/jpeg',
    });

    await service.scanReceipt('group-1', file);

    expect(functionsModule.httpsCallable).toHaveBeenCalledWith(
      mockFunctions,
      'scanReceipt'
    );
    expect(scanReceiptFn).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        imageBase64: expect.any(String),
      })
    );
    const { imageBase64 } = scanReceiptFn.mock.calls[0]![0];
    expect(imageBase64.length).toBeGreaterThan(0);
    expect(imageBase64).not.toContain('data:');
  });

  it('returns the parsed receipt data from the cloud function result', async () => {
    const file = new File(['fake-image-bytes'], 'receipt.jpg', {
      type: 'image/jpeg',
    });

    const result = await service.scanReceipt('group-1', file);

    expect(result).toEqual(mockParsed);
  });
});
