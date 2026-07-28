import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CameraService } from '@services/camera.service';
import {
  createMockCameraService,
  createMockMatDialog,
  createMockSnackBar,
  createMockUserStore,
} from '@testing/test-helpers';
import { UserStore } from '@store/user.store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptFileSelectionService } from './receipt-file-selection.service';

describe('ReceiptFileSelectionService', () => {
  let service: ReceiptFileSelectionService;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockCameraService: ReturnType<typeof createMockCameraService>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;

  function dialogResult(value: unknown) {
    return { afterClosed: () => ({ subscribe: (cb: any) => cb(value) }) };
  }

  beforeEach(() => {
    mockDialog = createMockMatDialog();
    mockCameraService = createMockCameraService();
    mockUserStore = createMockUserStore();
    mockSnackBar = createMockSnackBar();

    TestBed.configureTestingModule({
      providers: [
        ReceiptFileSelectionService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: CameraService, useValue: mockCameraService },
        { provide: UserStore, useValue: mockUserStore },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    });
    service = TestBed.inject(ReceiptFileSelectionService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ensureReceiptPolicyAccepted', () => {
    it('resolves true without opening a dialog when already accepted', async () => {
      mockUserStore.user.set({ receiptPolicy: true } as any);
      const result = await service.ensureReceiptPolicyAccepted();
      expect(result).toBe(true);
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('opens the policy dialog and resolves its result when not yet accepted', async () => {
      mockUserStore.user.set({ receiptPolicy: false } as any);
      mockDialog.open.mockReturnValueOnce(dialogResult(true) as any);
      const result = await service.ensureReceiptPolicyAccepted();
      expect(result).toBe(true);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('resolves false when the policy dialog is declined', async () => {
      mockUserStore.user.set(null);
      mockDialog.open.mockReturnValueOnce(dialogResult(false) as any);
      const result = await service.ensureReceiptPolicyAccepted();
      expect(result).toBe(false);
    });
  });

  describe('pickSource', () => {
    it('returns cancelled when the source dialog is dismissed', async () => {
      mockDialog.open.mockReturnValueOnce(dialogResult(null) as any);
      const result = await service.pickSource(false);
      expect(result).toEqual({ type: 'cancelled' });
    });

    it('returns browseFiles when the user picks file browsing', async () => {
      mockDialog.open.mockReturnValueOnce(dialogResult('file') as any);
      const result = await service.pickSource(false);
      expect(result).toEqual({ type: 'browseFiles' });
    });

    it('resolves a selected file from the camera', async () => {
      const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
      mockDialog.open.mockReturnValueOnce(dialogResult('camera') as any);
      mockCameraService.takePicture.mockResolvedValueOnce(file);
      const result = await service.pickSource(true);
      expect(result).toEqual({ type: 'selected', file });
    });

    it('resolves a selected file from the gallery', async () => {
      const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
      mockDialog.open.mockReturnValueOnce(dialogResult('gallery') as any);
      mockCameraService.selectFromGallery.mockResolvedValueOnce(file);
      const result = await service.pickSource(true);
      expect(result).toEqual({ type: 'selected', file });
    });

    it('returns cancelled when the camera resolves no file', async () => {
      mockDialog.open.mockReturnValueOnce(dialogResult('camera') as any);
      mockCameraService.takePicture.mockResolvedValueOnce(null);
      const result = await service.pickSource(true);
      expect(result).toEqual({ type: 'cancelled' });
    });

    it('resolves a selected file pasted from the clipboard', async () => {
      const file = new File(['x'], 'pasted-receipt.png', {
        type: 'image/png',
      });
      mockDialog.open.mockReturnValueOnce(dialogResult('clipboard') as any);
      vi.spyOn(service, 'pasteFromClipboard').mockResolvedValueOnce(file);
      const result = await service.pickSource(false);
      expect(result).toEqual({ type: 'selected', file });
    });

    it('shows a snackbar and returns cancelled if selection throws', async () => {
      mockDialog.open.mockReturnValueOnce(dialogResult('camera') as any);
      mockCameraService.takePicture.mockRejectedValueOnce(new Error('boom'));
      const result = await service.pickSource(true);
      expect(result).toEqual({ type: 'cancelled' });
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('pasteFromClipboard', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns a File built from the first image item on the clipboard', async () => {
      const blob = new Blob(['x'], { type: 'image/png' });
      vi.stubGlobal('navigator', {
        clipboard: {
          read: vi.fn().mockResolvedValue([
            {
              types: ['image/png'],
              getType: vi.fn().mockResolvedValue(blob),
            },
          ]),
        },
      });

      const file = await service.pasteFromClipboard();

      expect(file).toBeInstanceOf(File);
      expect(file!.name).toBe('pasted-receipt.png');
      expect(file!.type).toBe('image/png');
    });

    it('shows a snackbar and returns null when no image is found', async () => {
      vi.stubGlobal('navigator', {
        clipboard: {
          read: vi.fn().mockResolvedValue([{ types: ['text/plain'] }]),
        },
      });

      const file = await service.pasteFromClipboard();

      expect(file).toBeNull();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('shows a snackbar and returns null when reading the clipboard throws', async () => {
      vi.stubGlobal('navigator', {
        clipboard: {
          read: vi.fn().mockRejectedValue(new Error('permission denied')),
        },
      });

      const file = await service.pasteFromClipboard();

      expect(file).toBeNull();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('validateFile', () => {
    it('returns the file when under the size limit', () => {
      const file = new File(['x'], 'small.jpg', { type: 'image/jpeg' });
      expect(service.validateFile(file)).toBe(file);
    });

    it('shows a snackbar and returns null when over the size limit', () => {
      const bigContent = new Uint8Array(6 * 1024 * 1024);
      const file = new File([bigContent], 'big.jpg', { type: 'image/jpeg' });
      expect(service.validateFile(file)).toBeNull();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });
});
