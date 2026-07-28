import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import {
  FileSelectionDialogComponent,
  FileSelectionOption,
} from '@components/file-selection-dialog/file-selection-dialog.component';
import { ReceiptDialogComponent } from '@components/receipt-dialog/receipt-dialog.component';
import { UserStore } from '@store/user.store';
import { CameraService } from './camera.service';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ReceiptFilePickResult =
  | { type: 'selected'; file: File }
  | { type: 'browseFiles' }
  | { type: 'cancelled' };

/**
 * Shared receipt-photo picker: the one-time receipt-policy gate, the
 * platform-aware camera/gallery/file/clipboard chooser dialog, and file
 * size validation. Used by both AddExpenseComponent (attaching a receipt to
 * a manually-entered expense) and the receipt-scan wizard (picking a photo
 * to run OCR against) so this logic exists in exactly one place.
 *
 * The "browse files" choice can't be fully handled here since it needs a
 * real `<input type="file">` in the caller's own template - callers should
 * trigger their own file input on `{ type: 'browseFiles' }` and pass the
 * resulting File to `validateFile`.
 */
@Injectable({
  providedIn: 'root',
})
export class ReceiptFileSelectionService {
  protected readonly dialog = inject(MatDialog);
  protected readonly cameraService = inject(CameraService);
  protected readonly userStore = inject(UserStore);
  protected readonly snackbar = inject(MatSnackBar);

  /** Shows the one-time receipt policy dialog if not already accepted. Resolves true if the caller may proceed. */
  async ensureReceiptPolicyAccepted(): Promise<boolean> {
    const currentUser = this.userStore.user();
    if (currentUser?.receiptPolicy) return true;

    const dialogRef = this.dialog.open(ReceiptDialogComponent, {
      disableClose: true,
      maxWidth: '600px',
    });
    return new Promise<boolean>((resolve) => {
      dialogRef.afterClosed().subscribe((accepted) => resolve(!!accepted));
    });
  }

  /** Opens the platform-aware source picker and resolves camera/gallery/clipboard choices directly. */
  async pickSource(isNativePlatform: boolean): Promise<ReceiptFilePickResult> {
    const dialogRef = this.dialog.open(FileSelectionDialogComponent, {
      disableClose: false,
      maxWidth: '400px',
      data: { isNativePlatform },
    });
    const choice: FileSelectionOption | null = await new Promise((resolve) => {
      dialogRef.afterClosed().subscribe((value) => resolve(value));
    });

    if (!choice) return { type: 'cancelled' };
    if (choice === 'file') return { type: 'browseFiles' };

    try {
      let file: File | null = null;
      if (choice === 'camera') {
        file = await this.cameraService.takePicture();
      } else if (choice === 'gallery') {
        file = await this.cameraService.selectFromGallery();
      } else if (choice === 'clipboard') {
        file = await this.pasteFromClipboard();
      }
      return file ? { type: 'selected', file } : { type: 'cancelled' };
    } catch (error) {
      console.error('Error selecting file:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Failed to select file. Please try again.' },
      });
      return { type: 'cancelled' };
    }
  }

  /** Reads an image from the clipboard. Shows a snackbar and returns null on failure/empty. */
  async pasteFromClipboard(): Promise<File | null> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const extension = imageType.split('/')[1] || 'png';
          return new File([blob], `pasted-receipt.${extension}`, {
            type: imageType,
          });
        }
      }
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'No image found in clipboard.' },
      });
      return null;
    } catch (error) {
      console.error('Error reading from clipboard:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message: 'Unable to read from clipboard. Please check permissions.',
        },
      });
      return null;
    }
  }

  /** Validates a selected file's size. Shows a snackbar and returns null if too large. */
  validateFile(file: File): File | null {
    if (file.size > MAX_FILE_BYTES) {
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'File is too large. File size limited to 5MB.' },
      });
      return null;
    }
    return file;
  }
}
