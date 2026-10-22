import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockUserStore,
  mockUser,
} from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPaymentsComponent } from './account-payments.component';

describe('AccountPaymentsComponent', () => {
  let fixture: ComponentFixture<AccountPaymentsComponent>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };
  let mockUserService: { updateUser: ReturnType<typeof vi.fn> };

  async function createComponent(): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(
      mockUser({
        venmoId: 'venmo-1',
        paypalId: 'paypal-1',
        cashAppId: 'cash-1',
        zelleId: 'zelle-1',
      })
    );
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();
    mockSnackbar = { openFromComponent: vi.fn() };
    mockUserService = { updateUser: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [AccountPaymentsComponent],
      providers: [
        { provide: UserStore, useValue: mockUserStore },
        { provide: UserService, useValue: mockUserService },
        { provide: LoadingService, useValue: mockLoading },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPaymentsComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function input(testId: string): HTMLInputElement {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLInputElement;
  }

  function type(testId: string, value: string): void {
    const el = input(testId);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function saveButton(): HTMLButtonElement {
    return input('save-payments-button') as unknown as HTMLButtonElement;
  }

  function messages(): string[] {
    return mockSnackbar.openFromComponent.mock.calls.map(
      (c) => c[1].data.message
    );
  }

  const flush = () => new Promise<void>((r) => setTimeout(r));

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('form seeding', () => {
    it('should seed all four IDs from the user store', async () => {
      await createComponent();
      expect(input('venmo-input').value).toBe('venmo-1');
      expect(input('paypal-input').value).toBe('paypal-1');
      expect(input('cashapp-input').value).toBe('cash-1');
      expect(input('zelle-input').value).toBe('zelle-1');
    });

    it('should re-seed the form when the user in the store changes', async () => {
      await createComponent();
      mockUserStore.user.set(
        mockUser({
          venmoId: 'venmo-2',
          paypalId: '',
          cashAppId: 'cash-2',
          zelleId: 'zelle-2',
        })
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(input('venmo-input').value).toBe('venmo-2');
      expect(input('paypal-input').value).toBe('');
      expect(input('cashapp-input').value).toBe('cash-2');
      expect(input('zelle-input').value).toBe('zelle-2');
    });

    it('should seed empty strings when the user has no IDs', async () => {
      await createComponent();
      mockUserStore.user.set(null);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(input('venmo-input').value).toBe('');
      expect(input('zelle-input').value).toBe('');
    });
  });

  describe('save', () => {
    it('should keep Save disabled until a field changes', async () => {
      await createComponent();
      expect(saveButton().disabled).toBe(true);
      type('paypal-input', 'paypal-new');
      expect(saveButton().disabled).toBe(false);
    });

    it('should send all four IDs, show the snackbar and disable Save again', async () => {
      await createComponent();
      type('paypal-input', 'paypal-new');

      saveButton().click();
      await flush();
      fixture.detectChanges();

      expect(mockUserService.updateUser).toHaveBeenCalledTimes(1);
      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        venmoId: 'venmo-1',
        paypalId: 'paypal-new',
        cashAppId: 'cash-1',
        zelleId: 'zelle-1',
      });
      expect(messages()).toEqual(['Payment service IDs updated']);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(saveButton().disabled).toBe(true);
    });

    it('should pair loadingOn and loadingOff, turning off only after the save settles', async () => {
      await createComponent();
      let resolveSave!: () => void;
      mockUserService.updateUser.mockReturnValue(
        new Promise<void>((resolve) => (resolveSave = resolve))
      );
      type('venmo-input', 'venmo-new');

      const done = (fixture.componentInstance as any).onSubmitPayments();
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).not.toHaveBeenCalled();

      resolveSave();
      await done;
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should show the Error message, log it and still turn loading off', async () => {
      await createComponent();
      mockUserService.updateUser.mockRejectedValue(new Error('Permission denied'));
      type('venmo-input', 'venmo-new');

      saveButton().click();
      await flush();

      expect(messages()).toEqual(['Permission denied']);
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Payments Component',
        'update_payments',
        'Permission denied'
      );
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should show the generic message for a non-Error rejection and not log it', async () => {
      await createComponent();
      mockUserService.updateUser.mockRejectedValue('boom');
      type('venmo-input', 'venmo-new');

      saveButton().click();
      await flush();

      expect(messages()).toEqual([
        'Something went wrong - could not update payment service IDs',
      ]);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should keep the typed values and leave Save enabled after a failed save', async () => {
      await createComponent();
      mockUserService.updateUser.mockRejectedValue(new Error('nope'));
      type('venmo-input', 'venmo-new');

      saveButton().click();
      await flush();
      fixture.detectChanges();

      expect(input('venmo-input').value).toBe('venmo-new');
      expect(saveButton().disabled).toBe(false);
    });
  });
});
