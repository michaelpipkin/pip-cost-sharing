import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { PaymentDialogComponent } from './payment-dialog.component';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockSnackBar,
  createMockAnalyticsService,
} from '@testing/test-helpers';

describe('PaymentDialogComponent', () => {
  let fixture: ComponentFixture<PaymentDialogComponent>;
  let component: PaymentDialogComponent;
  let el: HTMLElement;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;

  const fullPaymentData = {
    payToMemberName: 'Alice',
    venmoId: '@alice-venmo',
    paypalId: 'alice@paypal.com',
    cashAppId: '$alice-cash',
    zelleId: 'alice@zelle.com',
  };

  const emptyPaymentData = {
    payToMemberName: 'Bob',
    venmoId: '',
    paypalId: '',
    cashAppId: '',
    zelleId: '',
  };

  async function createComponent(data: typeof fullPaymentData) {
    mockSnackBar = createMockSnackBar();

    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true,
      });
    }

    await TestBed.configureTestingModule({
      imports: [PaymentDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentDialogComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('with payment methods', () => {
    beforeEach(async () => {
      await createComponent(fullPaymentData);
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display the dialog title', () => {
      expect(query('payment-dialog-title')?.textContent?.trim()).toBe(
        'Record Payment'
      );
    });

    it('should display payment instructions with member name', () => {
      expect(query('payment-instructions')?.textContent).toContain('Alice');
    });

    it('should display payment methods list', () => {
      expect(query('payment-methods-list')).toBeTruthy();
    });

    it('should display Venmo link and copy button', () => {
      expect(query('venmo-link')).toBeTruthy();
      expect(query('copy-venmo-id-button')).toBeTruthy();
    });

    it('should display PayPal link and copy button', () => {
      expect(query('paypal-link')).toBeTruthy();
      expect(query('copy-paypal-id-button')).toBeTruthy();
    });

    it('should display CashApp link and copy button', () => {
      expect(query('cashapp-link')).toBeTruthy();
      expect(query('copy-cashapp-id-button')).toBeTruthy();
    });

    it('should display Zelle link and copy button', () => {
      expect(query('zelle-link')).toBeTruthy();
      expect(query('copy-zelle-id-button')).toBeTruthy();
    });

    it('should not show no-payment-methods message when IDs are present', () => {
      expect(query('no-payment-methods-message')).toBeFalsy();
    });

    it('should copy payment ID to clipboard and show snackbar on success', async () => {
      const clipboardSpy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue();

      await component.copyPaymentIdToClipboard('@alice-venmo');

      expect(clipboardSpy).toHaveBeenCalledWith('@alice-venmo');
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should show error snackbar when clipboard write fails', async () => {
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
        new Error('Clipboard unavailable')
      );

      await component.copyPaymentIdToClipboard('@alice-venmo');

      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('submit button should have mat-dialog-close set to true', () => {
      const submitBtnDe = fixture.debugElement.query(
        By.css('[data-testid="submit-payment-button"]')
      );
      const closeDir = submitBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('cancel button should have mat-dialog-close set to false', () => {
      const cancelBtnDe = fixture.debugElement.query(
        By.css('[data-testid="cancel-payment-button"]')
      );
      const closeDir = cancelBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(false);
    });
  });

  describe('without payment methods', () => {
    beforeEach(async () => {
      await createComponent(emptyPaymentData);
    });

    it('should show no-payment-methods message', () => {
      expect(query('no-payment-methods-message')).toBeTruthy();
      expect(query('no-payment-methods-message')?.textContent).toContain('Bob');
    });

    it('should not show payment methods list', () => {
      expect(query('payment-methods-list')).toBeFalsy();
    });
  });
});
