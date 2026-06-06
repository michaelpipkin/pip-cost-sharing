import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  createMockLoadingService,
  createMockPwaDetectionService,
  createMockSnackBar,
} from '@testing/test-helpers';
import { getAuth } from 'firebase/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoginComponent } from './login.component';

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
});
