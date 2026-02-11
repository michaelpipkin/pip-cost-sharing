import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import { LoginComponent } from './login.component';
import { LoadingService } from '@shared/loading/loading.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  createMockLoadingService,
  createMockPwaDetectionService,
  createMockSnackBar,
} from '@testing/test-helpers';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let el: HTMLElement;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;

  beforeEach(async () => {
    mockPwaDetection = createMockPwaDetectionService();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: {} },
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
    it('should have required validation on email', () => {
      component.loginForm.controls.email.setValue('');
      component.loginForm.controls.email.markAsTouched();
      expect(component.loginForm.controls.email.hasError('required')).toBe(
        true
      );
    });

    it('should have email format validation', () => {
      component.loginForm.controls.email.setValue('notanemail');
      component.loginForm.controls.email.markAsTouched();
      expect(component.loginForm.controls.email.hasError('email')).toBe(true);
    });

    it('should accept valid email', () => {
      component.loginForm.controls.email.setValue('test@example.com');
      expect(component.loginForm.controls.email.valid).toBe(true);
    });

    it('should have required validation on password', () => {
      component.loginForm.controls.password.setValue('');
      component.loginForm.controls.password.markAsTouched();
      expect(component.loginForm.controls.password.hasError('required')).toBe(
        true
      );
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
});
