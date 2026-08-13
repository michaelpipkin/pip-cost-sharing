import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockPwaDetectionService,
  createMockSnackBar,
} from '@testing/test-helpers';
import * as firebaseAuthModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let el: HTMLElement;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPwaDetection = createMockPwaDetectionService();
    mockAnalytics = createMockAnalyticsService();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: {} },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: PwaDetectionService, useValue: mockPwaDetection },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render', () => {
    it('should render login title', () => {
      expect(query('login-title')?.textContent?.trim()).toBe('Login');
    });

    it('should render email form field', () => {
      expect(query('email-input')).toBeTruthy();
    });

    it('should render password form field', () => {
      expect(query('password-input')).toBeTruthy();
    });

    it('should render login submit button', () => {
      expect(query('login-submit-button')).toBeTruthy();
    });

    it('should render Google sign-in button', () => {
      expect(query('google-login-button')).toBeTruthy();
    });

    it('should render forgot password link', () => {
      expect(query('forgot-password-link')).toBeTruthy();
    });

    it('should render create account link', () => {
      expect(query('register-link')).toBeTruthy();
    });
  });

  describe('password visibility toggle', () => {
    it('should start with password hidden', () => {
      const input = query('password-input') as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('should toggle to visible when button is clicked', async () => {
      component.toggleHidePassword();
      await fixture.whenStable();

      const input = query('password-input') as HTMLInputElement;
      expect(input.type).toBe('text');
    });

    it('should toggle back to hidden on second click', async () => {
      component.toggleHidePassword();
      component.toggleHidePassword();
      await fixture.whenStable();

      const input = query('password-input') as HTMLInputElement;
      expect(input.type).toBe('password');
    });
  });

  describe('form validation', () => {
    it('should show email format error for invalid email', async () => {
      const input = query('email-input') as HTMLInputElement;
      input.value = 'notanemail';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query('email-error-0')).toBeTruthy();
    });

    it('should not show email format error for valid email', async () => {
      const input = query('email-input') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(query('email-error-0')).toBeFalsy();
    });
  });

  describe('platform-specific content', () => {
    // Default mock: isRunningInBrowser=true, isRunningAsApp=false
    it('should show app download section when running in browser', () => {
      expect(query('app-download')).toBeTruthy();
      expect(query('web-visit')).toBeFalsy();
    });

    it('should delegate isRunningInBrowser to PwaDetectionService', () => {
      expect(component.isRunningInBrowser()).toBe(true);
      expect(mockPwaDetection.isRunningInBrowser).toHaveBeenCalled();
    });

    it('should delegate isRunningAsApp to PwaDetectionService', () => {
      expect(component.isRunningAsApp()).toBe(false);
      expect(mockPwaDetection.isRunningAsApp).toHaveBeenCalled();
    });
  });

  describe('googleLogin analytics', () => {
    // mockPwaDetection.isRunningAsApp() is false by default, so googleLogin() uses signInWithPopup
    it('should log a sign_up event when Google sign-in creates a new user', async () => {
      vi.spyOn(firebaseAuthModule, 'getAdditionalUserInfo').mockReturnValue({
        isNewUser: true,
        providerId: 'google.com',
      });

      await component.googleLogin();

      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('sign_up', {
        method: 'google.com',
      });
    });

    it('should not log a sign_up event when Google sign-in is an existing user', async () => {
      vi.spyOn(firebaseAuthModule, 'getAdditionalUserInfo').mockReturnValue({
        isNewUser: false,
        providerId: 'google.com',
      });

      await component.googleLogin();

      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith(
        'sign_up',
        expect.anything()
      );
    });
  });

  describe('double-submit guard', () => {
    it('should not fire signInWithPopup twice when googleLogin is called rapidly', async () => {
      const signInSpy = vi
        .spyOn(firebaseAuthModule, 'signInWithPopup')
        .mockResolvedValue({ user: {} } as any);

      const first = component.googleLogin();
      const second = component.googleLogin();
      await Promise.all([first, second]);

      expect(signInSpy).toHaveBeenCalledTimes(1);
    });

    it('should block emailLogin while googleLogin is still in flight (shared guard)', async () => {
      vi.spyOn(firebaseAuthModule, 'signInWithPopup').mockResolvedValue({
        user: {},
      } as any);
      const emailSignInSpy = vi.spyOn(
        firebaseAuthModule,
        'signInWithEmailAndPassword'
      );

      const first = component.googleLogin();
      const second = component.emailLogin();
      await Promise.all([first, second]);

      expect(emailSignInSpy).not.toHaveBeenCalled();
    });

    it('should allow a fresh login attempt after the previous one finishes', async () => {
      const signInSpy = vi
        .spyOn(firebaseAuthModule, 'signInWithPopup')
        .mockResolvedValue({ user: {} } as any);

      await component.googleLogin();
      await component.googleLogin();

      expect(signInSpy).toHaveBeenCalledTimes(2);
    });
  });
});
