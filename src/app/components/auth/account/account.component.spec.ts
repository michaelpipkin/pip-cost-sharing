import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import * as authModule from 'firebase/auth';
import { AccountComponent } from './account.component';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { UserService } from '@services/user.service';
import { GroupService } from '@services/group.service';
import { SplitService } from '@services/split.service';
import { ExpenseService } from '@services/expense.service';
import { MemorizedService } from '@services/memorized.service';
import { MemberService } from '@services/member.service';
import { HistoryService } from '@services/history.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockUserStore,
  createMockGroupStore,
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
  createMockGroupService,
  createMockSplitService,
  createMockExpenseService,
  createMockMemorizedService,
  createMockHistoryService,
  mockUser,
} from '@testing/test-helpers';

describe('AccountComponent', () => {
  let fixture: ComponentFixture<AccountComponent>;
  let component: AccountComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockUserService: {
    updateUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockMemberService: { updateAllMemberEmails: ReturnType<typeof vi.fn> };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;

  const mockAuthWithUser = {
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
    },
  };

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockSnackBar = createMockSnackBar();
    mockLoadingService = createMockLoadingService();
    mockUserService = {
      updateUser: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    mockMemberService = {
      updateAllMemberEmails: vi.fn().mockResolvedValue(0),
    };

    mockUserStore.user.set(mockUser());

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: mockAuthWithUser },
        { provide: getFunctions, useValue: {} },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: UserService, useValue: mockUserService },
        { provide: GroupService, useValue: createMockGroupService() },
        { provide: SplitService, useValue: createMockSplitService() },
        { provide: ExpenseService, useValue: createMockExpenseService() },
        { provide: MemorizedService, useValue: createMockMemorizedService() },
        { provide: MemberService, useValue: mockMemberService },
        { provide: HistoryService, useValue: createMockHistoryService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('form initialization', () => {
    it('should initialize emailForm with current user email', () => {
      expect(component.emailForm.value.email).toBe('test@example.com');
    });

    it('should initialize passwordForm', () => {
      expect(component.passwordForm).toBeTruthy();
    });

    it('should initialize paymentsForm', () => {
      expect(component.paymentsForm).toBeTruthy();
    });
  });

  describe('passwordMatchValidator', () => {
    it('should return null when passwords match', () => {
      component.passwordForm.setValue({
        password: 'password123',
        confirmPassword: 'password123',
      });
      expect(component.passwordForm.errors).toBeNull();
    });

    it('should return mismatch error when passwords do not match', () => {
      component.passwordForm.setValue({
        password: 'password123',
        confirmPassword: 'different',
      });
      expect(component.passwordForm.errors).toEqual({ mismatch: true });
    });
  });

  describe('onSubmitEmail', () => {
    it('should not call updateEmail when email matches current user', async () => {
      const updateEmailSpy = vi
        .spyOn(authModule, 'updateEmail')
        .mockResolvedValue(undefined);
      component.e.email.setValue('test@example.com');
      await component.onSubmitEmail();
      expect(updateEmailSpy).not.toHaveBeenCalled();
    });

    it('should call updateEmail when email changed', async () => {
      const updateEmailSpy = vi
        .spyOn(authModule, 'updateEmail')
        .mockResolvedValue(undefined);
      vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue(undefined);
      component.e.email.setValue('newemail@example.com');
      await component.onSubmitEmail();
      expect(updateEmailSpy).toHaveBeenCalled();
    });
  });

  describe('onSubmitPayments', () => {
    it('should call userService.updateUser with payment IDs', async () => {
      component.p.venmoId.setValue('@myvenmo');
      await component.onSubmitPayments();
      expect(mockUserService.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ venmoId: '@myvenmo' })
      );
    });

    it('should call loadingOn and loadingOff', async () => {
      await component.onSubmitPayments();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });

  describe('acceptReceiptPolicy', () => {
    it('should call userService.updateUser with receiptPolicy: true', async () => {
      await component.acceptReceiptPolicy();
      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        receiptPolicy: true,
      });
    });

    it('should show snackbar on success', async () => {
      await component.acceptReceiptPolicy();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('syncMemberEmails', () => {
    it('should call memberService.updateAllMemberEmails', async () => {
      await component.syncMemberEmails();
      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalled();
    });

    it('should call loadingOn and loadingOff', async () => {
      await component.syncMemberEmails();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });

  describe('toggleHidePassword / toggleHideConfirm', () => {
    it('should toggle hidePassword', () => {
      expect(component.hidePassword()).toBe(true);
      component.toggleHidePassword();
      expect(component.hidePassword()).toBe(false);
    });

    it('should toggle hideConfirm', () => {
      expect(component.hideConfirm()).toBe(true);
      component.toggleHideConfirm();
      expect(component.hideConfirm()).toBe(false);
    });
  });
});
