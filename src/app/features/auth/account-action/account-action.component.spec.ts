import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import * as authModule from 'firebase/auth';
import { AccountActionComponent } from './account-action.component';
import { LoadingService } from '@shared/loading/loading.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockLoadingService,
  createMockUserStore,
  createMockAnalyticsService,
  createMockSnackBar,
} from '@testing/test-helpers';

describe('AccountActionComponent', () => {
  let fixture: ComponentFixture<AccountActionComponent>;
  let component: AccountActionComponent;
  let mockUserService: {
    updateUserEmailAndLinkMembers: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;

  const mockAuthWithUser = {
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
      reload: vi.fn().mockResolvedValue(undefined),
    },
  };

  const mockAuthWithoutUser = {
    currentUser: null,
  };

  async function createComponent(
    authValue: any,
    queryParams: Record<string, string>
  ) {
    mockSnackBar = createMockSnackBar();
    mockUserStore = createMockUserStore();
    mockUserService = {
      updateUserEmailAndLinkMembers: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    };

    const mockRoute = {
      snapshot: { queryParams },
    };

    await TestBed.configureTestingModule({
      imports: [AccountActionComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: authValue },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserService, useValue: mockUserService },
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountActionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('when no oobCode is provided', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, { mode: 'verifyEmail' });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should set errorMessage when no oobCode', () => {
      expect(component.errorMessage()).toContain('Invalid link');
    });

    it('should have null mode', () => {
      expect(component.mode()).toBeNull();
    });
  });

  describe('in verifyEmail mode', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'test-verify-code',
      });
    });

    it('should set mode to verifyEmail', () => {
      expect(component.mode()).toBe('verifyEmail');
    });

    it('should call applyActionCode on initialization', () => {
      expect(authModule.applyActionCode).toHaveBeenCalledWith(
        mockAuthWithUser,
        'test-verify-code'
      );
    });

    it('should set success to true on successful verification', async () => {
      await fixture.whenStable();
      expect(component.success()).toBe(true);
    });

    it('should return correct title', () => {
      expect(component.getTitle()).toBe('Email Verification');
    });

    it('should return correct success message', () => {
      expect(component.getSuccessMessage()).toContain('confirmed your email');
    });
  });

  describe('in resetPassword mode', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'confirmPasswordReset').mockResolvedValue(undefined);

      await createComponent(mockAuthWithoutUser, {
        mode: 'resetPassword',
        oobCode: 'test-reset-code',
      });
    });

    it('should set mode to resetPassword', () => {
      expect(component.mode()).toBe('resetPassword');
    });

    it('should return correct title', () => {
      expect(component.getTitle()).toBe('Reset Password');
    });

    it('should call confirmPasswordReset when resetPassword() is called', async () => {
      component.r.password.setValue('newpassword123');
      component.r.confirmPassword.setValue('newpassword123');

      await component.resetPassword();

      expect(authModule.confirmPasswordReset).toHaveBeenCalledWith(
        mockAuthWithoutUser,
        'test-reset-code',
        'newpassword123'
      );
    });

    it('should set success to true on successful reset', async () => {
      component.r.password.setValue('newpassword123');
      component.r.confirmPassword.setValue('newpassword123');
      await component.resetPassword();

      expect(component.success()).toBe(true);
    });
  });

  describe('handleError', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockRejectedValue({
        code: 'auth/invalid-action-code',
        message: 'Invalid code',
      });

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'invalid-code',
      });
    });

    it('should set errorMessage on auth error', async () => {
      await fixture.whenStable();
      expect(component.errorMessage()).toContain('invalid or has expired');
    });
  });

  describe('resendVerificationEmail', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue(undefined);

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'test-code',
      });
    });

    it('should call sendEmailVerification when user is logged in', async () => {
      await component.resendVerificationEmail();
      expect(authModule.sendEmailVerification).toHaveBeenCalled();
    });
  });

  describe('getTitle with no mode', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, {});
    });

    it('should return default title when mode is null', () => {
      expect(component.getTitle()).toBe('Account Action');
    });
  });
});
