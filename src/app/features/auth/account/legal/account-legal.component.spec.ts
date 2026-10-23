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
import { AccountLegalComponent } from './account-legal.component';

describe('AccountLegalComponent', () => {
  let fixture: ComponentFixture<AccountLegalComponent>;
  let component: AccountLegalComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };
  let mockUserService: { updateUser: ReturnType<typeof vi.fn> };

  async function createComponent(receiptPolicy = false): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser({ receiptPolicy }));
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();
    mockSnackbar = { openFromComponent: vi.fn() };
    mockUserService = { updateUser: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [AccountLegalComponent],
      providers: [
        { provide: UserStore, useValue: mockUserStore },
        { provide: UserService, useValue: mockUserService },
        { provide: LoadingService, useValue: mockLoading },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountLegalComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(testId: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function acceptButton(): HTMLButtonElement {
    return el('accept-policy-button') as HTMLButtonElement;
  }

  async function acknowledge(): Promise<void> {
    (el('policy-checkbox')!.querySelector('input') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
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

  it('should show the accepted note instead of the acceptance controls when already accepted', async () => {
    await createComponent(true);
    expect(el('policy-accepted')).not.toBeNull();
    expect(el('policy-acceptance')).toBeNull();
    expect(acceptButton()).toBeNull();
  });

  it('should keep Accept disabled until the policy is acknowledged', async () => {
    await createComponent();
    expect(acceptButton().disabled).toBe(true);

    await acknowledge();

    expect(component.receiptPolicyAcknowledged()).toBe(true);
    expect(acceptButton().disabled).toBe(false);
  });

  it('should disable Accept again when the acknowledgement is unchecked', async () => {
    await createComponent();
    await acknowledge();
    await acknowledge();

    expect(component.receiptPolicyAcknowledged()).toBe(false);
    expect(acceptButton().disabled).toBe(true);
  });

  it('should update the user, show the snackbar and clear the acknowledgement on success', async () => {
    await createComponent();
    await acknowledge();

    acceptButton().click();
    await flush();
    fixture.detectChanges();

    expect(mockUserService.updateUser).toHaveBeenCalledTimes(1);
    expect(mockUserService.updateUser).toHaveBeenCalledWith({
      receiptPolicy: true,
    });
    expect(messages()).toEqual(['Receipt retention policy accepted']);
    expect(component.receiptPolicyAcknowledged()).toBe(false);
    expect(mockAnalytics.logError).not.toHaveBeenCalled();
  });

  it('should pair loadingOn and loadingOff, turning off only after the update settles', async () => {
    await createComponent();
    let resolveUpdate!: () => void;
    mockUserService.updateUser.mockReturnValue(
      new Promise<void>((resolve) => (resolveUpdate = resolve))
    );

    const done = component.acceptReceiptPolicy();
    expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
    expect(mockLoading.loadingOff).not.toHaveBeenCalled();

    resolveUpdate();
    await done;
    expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
  });

  it('should show the Error message, log it and keep the acknowledgement when the update fails', async () => {
    await createComponent();
    await acknowledge();
    mockUserService.updateUser.mockRejectedValue(new Error('Permission denied'));

    acceptButton().click();
    await flush();

    expect(messages()).toEqual(['Permission denied']);
    expect(mockAnalytics.logError).toHaveBeenCalledWith(
      'Account Legal Component',
      'accept_receipt_policy',
      'Permission denied'
    );
    expect(component.receiptPolicyAcknowledged()).toBe(true);
    expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
  });

  it('should show the generic message for a non-Error rejection and not log it', async () => {
    await createComponent();
    mockUserService.updateUser.mockRejectedValue('boom');

    await component.acceptReceiptPolicy();

    expect(messages()).toEqual([
      'Something went wrong - could not accept receipt policy',
    ]);
    expect(mockAnalytics.logError).not.toHaveBeenCalled();
    expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
  });
});
