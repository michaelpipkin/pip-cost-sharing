import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { FirebaseError } from 'firebase/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppCheckErrorHandlerService } from './app-check-error-handler.service';

describe('AppCheckErrorHandlerService', () => {
  let service: AppCheckErrorHandlerService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockDialog = { open: vi.fn() };
    mockSnackbar = { openFromComponent: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AppCheckErrorHandlerService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    });
    service = TestBed.inject(AppCheckErrorHandlerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the App Check error dialog for a Firestore permission-denied error', () => {
    const error = new FirebaseError(
      'permission-denied',
      'Missing or insufficient permissions.'
    );

    service.handle(error, 'fallback message');

    expect(mockDialog.open).toHaveBeenCalledWith(AppCheckErrorDialogComponent, {
      disableClose: false,
      maxWidth: '80vw',
    });
    expect(mockSnackbar.openFromComponent).not.toHaveBeenCalled();
  });

  it('opens the App Check error dialog for a Functions unauthenticated error', () => {
    const error = new FirebaseError('functions/unauthenticated', 'Unauthenticated');

    service.handle(error, 'fallback message');

    expect(mockDialog.open).toHaveBeenCalledWith(AppCheckErrorDialogComponent, {
      disableClose: false,
      maxWidth: '80vw',
    });
    expect(mockSnackbar.openFromComponent).not.toHaveBeenCalled();
  });

  it('falls back to a snackbar with the provided message for a non-App-Check error', () => {
    const error = new Error('network blip');

    service.handle(error, 'fallback message');

    expect(mockSnackbar.openFromComponent).toHaveBeenCalledWith(
      CustomSnackbarComponent,
      { data: { message: 'fallback message' } }
    );
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('falls back to a snackbar for an unrelated FirebaseError code', () => {
    const error = new FirebaseError(
      'unavailable',
      'The service is currently unavailable.'
    );

    service.handle(error, 'fallback message');

    expect(mockSnackbar.openFromComponent).toHaveBeenCalled();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });
});
