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
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  const mockAuth = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPwaDetection = createMockPwaDetectionService();
    mockAnalytics = createMockAnalyticsService();
    mockLoading = createMockLoadingService();
    mockSnackBar = createMockSnackBar();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: mockAuth },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: LoadingService, useValue: mockLoading },
        { provide: MatSnackBar, useValue: mockSnackBar },
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
    // This form keeps Angular's email validator (ruling R6): lists are
    // refused, but a@b-style legacy addresses can still sign in / reset.
    it.each(['notanemail', 'test@example.com,other@example.com'])(
      'should show email format error for %s',
      async (email) => {
        const input = query('email-input') as HTMLInputElement;
        input.value = email;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        fixture.detectChanges();

        expect(query('email-error-0')?.textContent).toContain(
          'Invalid email address'
        );
      }
    );

    it('should accept a legacy a@b-style address (no stricter rule here)', async () => {
      const input = query('email-input') as HTMLInputElement;
      input.value = 'a@b';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(query('email-error-0')).toBeNull();
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

  // ---- Coverage pass B -------------------------------------------------

  const GENERIC_EMAIL_FAILURE =
    'Could not sign you in. Please check your email and password.';
  const GENERIC_GOOGLE_FAILURE =
    'There was a problem signing you in. Please try again or use a different sign-in method.';

  async function typeInto(testId: string, value: string) {
    const input = query(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submitForm() {
    (query('login-form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { cancelable: true })
    );
    await fixture.whenStable();
  }

  describe('signing in with email and password', () => {
    beforeEach(async () => {
      await typeInto('email-input', 'alice@example.com');
      await typeInto('password-input', 's3cret!');
    });

    it('checks the account first, then signs in with the typed credentials', async () => {
      const methods = vi
        .spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail')
        .mockResolvedValue(['password']);
      const signIn = vi
        .spyOn(firebaseAuthModule, 'signInWithEmailAndPassword')
        .mockResolvedValue({ user: {} } as any);

      await submitForm();

      expect(methods).toHaveBeenCalledWith(mockAuth, 'alice@example.com');
      expect(signIn).toHaveBeenCalledWith(
        mockAuth,
        'alice@example.com',
        's3cret!'
      );
      expect(methods.mock.invocationCallOrder[0]).toBeLessThan(
        signIn.mock.invocationCallOrder[0]!
      );
      // The overlay stays on: the auth listener finishes the navigation.
      expect(mockLoading.loadingOn).toHaveBeenCalledWith('navigation');
      expect(mockLoading.loadingOff).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it('also signs in an account that has Google plus a password', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockResolvedValue(
        ['google.com', 'password']
      );
      const signIn = vi
        .spyOn(firebaseAuthModule, 'signInWithEmailAndPassword')
        .mockResolvedValue({ user: {} } as any);

      await component.emailLogin();

      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('sends a Google-only account to the Google button instead of trying a password', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockResolvedValue(
        ['google.com']
      );
      const signIn = vi.spyOn(firebaseAuthModule, 'signInWithEmailAndPassword');

      await submitForm();

      expect(signIn).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Please sign in with Google' } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledWith('navigation');
    });

    it('says to check the email and password when sign-in is refused, and clears the overlay', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockResolvedValue(
        ['password']
      );
      vi.spyOn(firebaseAuthModule, 'signInWithEmailAndPassword').mockRejectedValue(
        new Error('auth/wrong-password')
      );

      await submitForm();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: GENERIC_EMAIL_FAILURE } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledWith('navigation');
    });

    it('gives the same message when the account lookup itself fails', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockRejectedValue(
        new Error('network')
      );
      const signIn = vi.spyOn(firebaseAuthModule, 'signInWithEmailAndPassword');

      await submitForm();

      expect(signIn).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: GENERIC_EMAIL_FAILURE } }
      );
    });

    it('lets the user try again after a failed attempt', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockResolvedValue(
        ['password']
      );
      const signIn = vi
        .spyOn(firebaseAuthModule, 'signInWithEmailAndPassword')
        .mockRejectedValueOnce(new Error('auth/wrong-password'))
        .mockResolvedValueOnce({ user: {} } as any);

      await submitForm();
      await submitForm();

      expect(signIn).toHaveBeenCalledTimes(2);
    });

    it('ignores a second submit while the first is in flight', async () => {
      const methods = vi
        .spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail')
        .mockResolvedValue(['password']);
      vi.spyOn(firebaseAuthModule, 'signInWithEmailAndPassword').mockResolvedValue({
        user: {},
      } as any);

      const first = component.emailLogin();
      const second = component.emailLogin();
      await Promise.all([first, second]);

      expect(methods).toHaveBeenCalledTimes(1);
    });

    it('signs in when Enter is pressed in the password field of a valid form', async () => {
      vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail').mockResolvedValue(
        ['password']
      );
      const signIn = vi
        .spyOn(firebaseAuthModule, 'signInWithEmailAndPassword')
        .mockResolvedValue({ user: {} } as any);

      (query('password-input') as HTMLInputElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
      );
      await fixture.whenStable();

      expect(signIn).toHaveBeenCalledTimes(1);
    });

    it('does not sign in on Enter while the email is invalid', async () => {
      await typeInto('email-input', 'notanemail');
      const methods = vi.spyOn(firebaseAuthModule, 'fetchSignInMethodsForEmail');

      (query('password-input') as HTMLInputElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
      );
      await fixture.whenStable();

      expect(methods).not.toHaveBeenCalled();
    });
  });

  describe('signing in with Google in the browser', () => {
    it('opens the Google popup on this auth with a Google provider', async () => {
      const popup = vi
        .spyOn(firebaseAuthModule, 'signInWithPopup')
        .mockResolvedValue({ user: {} } as any);

      (query('google-login-button') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(popup).toHaveBeenCalledWith(
        mockAuth,
        expect.any(firebaseAuthModule.GoogleAuthProvider)
      );
      expect(mockLoading.loadingOn).toHaveBeenCalledWith('navigation');
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it('explains the failure, clears the overlay, and allows another attempt', async () => {
      const popup = vi
        .spyOn(firebaseAuthModule, 'signInWithPopup')
        .mockRejectedValueOnce(new Error('auth/popup-closed-by-user'))
        .mockResolvedValueOnce({ user: {} } as any);

      await component.googleLogin();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: GENERIC_GOOGLE_FAILURE } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledWith('navigation');

      await component.googleLogin();
      expect(popup).toHaveBeenCalledTimes(2);
    });
  });

  describe('signing in with Google in the installed app', () => {
    beforeEach(() => {
      mockPwaDetection.isRunningAsApp.mockReturnValue(true);
      mockPwaDetection.isRunningInBrowser.mockReturnValue(false);
    });

    // The Capacitor plugin proxy exposes no own methods to spy on, so these
    // run the plugin's real web fallback against the mocked firebase/auth;
    // the native success path (ID token handed to Firebase, sign_up for a
    // new user) cannot be driven in unit tests and has no automated cover.
    it('does not open the browser popup in the installed app, and explains a failed native sign-in', async () => {
      const popup = vi.spyOn(firebaseAuthModule, 'signInWithPopup');
      const withCredential = vi.spyOn(
        firebaseAuthModule,
        'signInWithCredential'
      );

      await component.googleLogin();

      expect(popup).not.toHaveBeenCalled();
      expect(withCredential).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: GENERIC_GOOGLE_FAILURE } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledWith('navigation');
    });

    it('shows the "visit us on the web" note instead of the app download', async () => {
      fixture = TestBed.createComponent(LoginComponent);
      el = fixture.nativeElement;
      await fixture.whenStable();

      expect(query('web-visit')).toBeTruthy();
      expect(query('app-download')).toBeNull();
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
