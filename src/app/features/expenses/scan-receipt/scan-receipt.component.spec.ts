import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ParsedReceipt } from '@models/receipt-scan';
import { CameraService } from '@services/camera.service';
import { LocaleService } from '@services/locale.service';
import { ReceiptFileSelectionService } from '@services/receipt-file-selection.service';
import { ReceiptScanHandoffService } from '@services/receipt-scan-handoff.service';
import { ReceiptScanService } from '@services/receipt-scan.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import {
  createMockCameraService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockReceiptFileSelectionService,
  createMockReceiptScanHandoffService,
  createMockReceiptScanService,
  createMockSnackBar,
  mockDocRef,
  mockGroup,
  mockMember,
} from '@testing/test-helpers';
import { StringUtils } from '@utils/string-utils.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanReceiptComponent } from './scan-receipt.component';

describe('ScanReceiptComponent', () => {
  let fixture: ComponentFixture<ScanReceiptComponent>;
  let component: ScanReceiptComponent;
  let router: Router;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockReceiptFileSelection: ReturnType<
    typeof createMockReceiptFileSelectionService
  >;
  let mockReceiptScanService: ReturnType<typeof createMockReceiptScanService>;
  let mockReceiptScanHandoff: ReturnType<
    typeof createMockReceiptScanHandoffService
  >;

  const memberAlice = mockMember({
    id: 'member-1',
    displayName: 'Alice',
    ref: mockDocRef('groups/group-1/members/member-1'),
  });
  const memberBob = mockMember({
    id: 'member-2',
    displayName: 'Bob',
    ref: mockDocRef('groups/group-1/members/member-2'),
  });

  function file(): File {
    return new File(['bytes'], 'receipt.jpg', { type: 'image/jpeg' });
  }

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockReceiptFileSelection = createMockReceiptFileSelectionService();
    mockReceiptScanService = createMockReceiptScanService();
    mockReceiptScanHandoff = createMockReceiptScanHandoffService();

    mockGroupStore.currentGroup.set(
      mockGroup({ id: 'group-1', currencyCode: 'USD' })
    );
    mockMemberStore.groupMembers.set([memberAlice, memberBob]);

    await TestBed.configureTestingModule({
      imports: [ScanReceiptComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CameraService, useValue: createMockCameraService() },
        { provide: MatDialog, useValue: createMockMatDialog() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        {
          provide: ReceiptFileSelectionService,
          useValue: mockReceiptFileSelection,
        },
        { provide: ReceiptScanService, useValue: mockReceiptScanService },
        {
          provide: ReceiptScanHandoffService,
          useValue: mockReceiptScanHandoff,
        },
        LocaleService,
        StringUtils,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScanReceiptComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has not scanned yet on init', () => {
    expect((component as any).hasScanned()).toBe(false);
  });

  describe('selectReceiptPhoto', () => {
    it('does nothing further if the receipt policy is declined', async () => {
      mockReceiptFileSelection.ensureReceiptPolicyAccepted.mockResolvedValueOnce(
        false
      );
      await (component as any).selectReceiptPhoto();
      expect(mockReceiptFileSelection.pickSource).not.toHaveBeenCalled();
    });

    it('scans the selected file and applies the parsed result', async () => {
      const selected = file();
      mockReceiptFileSelection.pickSource.mockResolvedValueOnce({
        type: 'selected',
        file: selected,
      });
      const parsed: ParsedReceipt = {
        total: 12.34,
        subtotal: 11.0,
        tax: 1.34,
        tip: null,
        lineItems: [
          { description: 'Latte', amount: 4.5, confidence: 92 },
          { description: 'Bagel', amount: 3.25, confidence: 40 },
        ],
        rawText: 'Coffee Shop\nLatte 4.50\nBagel 3.25',
      };
      mockReceiptScanService.scanReceipt.mockResolvedValueOnce(parsed);

      await (component as any).selectReceiptPhoto();

      expect(mockReceiptScanService.scanReceipt).toHaveBeenCalledWith(
        'group-1',
        selected
      );
      expect((component as any).hasScanned()).toBe(true);
      expect((component as any).totalAmount()).toBe('12.34');
      expect((component as any).taxAmount()).toBe('1.34');
      expect((component as any).tipAmount()).toBe('0.00');
      expect((component as any).description()).toBe('Coffee Shop');
      expect((component as any).lineItems()).toHaveLength(2);
      expect((component as any).isLowConfidence((component as any).lineItems()[1])).toBe(true);
      expect((component as any).isLowConfidence((component as any).lineItems()[0])).toBe(false);
    });

    it('falls back to subtotal + tax + tip when no total was found', async () => {
      mockReceiptFileSelection.pickSource.mockResolvedValueOnce({
        type: 'selected',
        file: file(),
      });
      mockReceiptScanService.scanReceipt.mockResolvedValueOnce({
        total: null,
        subtotal: 10,
        tax: 1,
        tip: 2,
        lineItems: [],
        rawText: '',
      });

      await (component as any).selectReceiptPhoto();

      expect((component as any).totalAmount()).toBe('13.00');
    });

    it('degrades to an empty, editable state when scanning fails', async () => {
      mockReceiptFileSelection.pickSource.mockResolvedValueOnce({
        type: 'selected',
        file: file(),
      });
      mockReceiptScanService.scanReceipt.mockRejectedValueOnce(
        new Error('OCR failed')
      );

      await (component as any).selectReceiptPhoto();

      expect((component as any).hasScanned()).toBe(true);
      expect((component as any).totalAmount()).toBe('0.00');
      expect((component as any).lineItems()).toEqual([]);
    });

    it('clicks the hidden file input when the user chooses to browse files', async () => {
      mockReceiptFileSelection.pickSource.mockResolvedValueOnce({
        type: 'browseFiles',
      });
      const fileInput: HTMLInputElement =
        fixture.nativeElement.querySelector('input[type="file"]');
      const clickSpy = vi.spyOn(fileInput, 'click');

      await (component as any).selectReceiptPhoto();

      expect(clickSpy).toHaveBeenCalled();
      expect(mockReceiptScanService.scanReceipt).not.toHaveBeenCalled();
    });
  });

  describe('line item management', () => {
    it('adds a blank editable item', () => {
      (component as any).addItem();
      expect((component as any).lineItems()).toEqual([
        { description: '', amount: '0.00', confidence: 100, assignedTo: null },
      ]);
    });

    it('removes an item by index', () => {
      (component as any).addItem();
      (component as any).addItem();
      (component as any).removeItem(0);
      expect((component as any).lineItems()).toHaveLength(1);
    });

    it('updates a field on an item', () => {
      (component as any).addItem();
      (component as any).updateItem(0, { description: 'Latte', amount: '4.50' });
      expect((component as any).lineItems()[0]).toMatchObject({
        description: 'Latte',
        amount: '4.50',
      });
    });
  });

  describe('running totals', () => {
    beforeEach(() => {
      (component as any).taxAmount.set('1.00');
      (component as any).tipAmount.set('2.00');
      (component as any).lineItems.set([
        { description: 'Latte', amount: '4.50', confidence: 90, assignedTo: memberAlice.ref },
        { description: 'Bagel', amount: '3.25', confidence: 90, assignedTo: memberAlice.ref },
        { description: 'Muffin', amount: '2.00', confidence: 90, assignedTo: memberBob.ref },
        { description: 'Shared fries', amount: '5.00', confidence: 90, assignedTo: null },
      ]);
    });

    it('sums each member subtotal from their assigned items only', () => {
      const totals = (component as any).memberSubtotals();
      expect(totals).toEqual([
        { member: memberAlice, amount: 7.75 },
        { member: memberBob, amount: 2 },
      ]);
    });

    it('sums unassigned items into the evenly-shared amount', () => {
      expect((component as any).unassignedItemsTotal()).toBe(5);
    });

    it('sums tax + tip into the proportionally-shared amount', () => {
      expect((component as any).taxTipTotal()).toBe(3);
    });
  });

  describe('canContinue', () => {
    it('is false with no file selected', () => {
      (component as any).totalAmount.set('10.00');
      expect((component as any).canContinue()).toBe(false);
    });

    it('is false when the total is zero', () => {
      (component as any).receiptFile.set(file());
      (component as any).totalAmount.set('0.00');
      expect((component as any).canContinue()).toBe(false);
    });

    it('is true once a file is selected and the total is positive', () => {
      (component as any).receiptFile.set(file());
      (component as any).totalAmount.set('10.00');
      expect((component as any).canContinue()).toBe(true);
    });
  });

  describe('onContinue', () => {
    beforeEach(() => {
      (component as any).receiptFile.set(file());
      (component as any).totalAmount.set('16.75');
      (component as any).taxAmount.set('1.00');
      (component as any).tipAmount.set('2.00');
      (component as any).description.set('Coffee Shop');
      (component as any).lineItems.set([
        { description: 'Latte', amount: '4.50', confidence: 90, assignedTo: memberAlice.ref },
        { description: 'Extra latte', amount: '4.25', confidence: 90, assignedTo: memberAlice.ref },
        { description: 'Muffin', amount: '2.00', confidence: 90, assignedTo: memberBob.ref },
        { description: 'Shared fries', amount: '5.00', confidence: 90, assignedTo: null },
      ]);
    });

    it('merges multiple items assigned to the same member into one split', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (component as any).onContinue();

      expect(mockReceiptScanHandoff.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmount: 16.75,
          description: 'Coffee Shop',
          sharedAmount: 5,
          proportionalAmount: 3,
          splits: expect.arrayContaining([
            { memberRef: memberAlice.ref, assignedAmount: 8.75 },
            { memberRef: memberBob.ref, assignedAmount: 2 },
          ]),
        })
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses/add']);
    });

    it('does nothing if canContinue is false', () => {
      (component as any).receiptFile.set(null);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      (component as any).onContinue();
      expect(mockReceiptScanHandoff.setPayload).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  it('onCancel navigates back to the expenses list', () => {
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (component as any).onCancel();
    expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
  });

  it('rescan resets the file and scanned state', () => {
    (component as any).receiptFile.set(file());
    (component as any).fileName.set('receipt.jpg');
    (component as any).hasScanned.set(true);
    (component as any).lineItems.set([
      { description: 'x', amount: '1.00', confidence: 90, assignedTo: null },
    ]);

    (component as any).rescan();

    expect((component as any).receiptFile()).toBeNull();
    expect((component as any).fileName()).toBe('');
    expect((component as any).hasScanned()).toBe(false);
    expect((component as any).lineItems()).toEqual([]);
  });
});
