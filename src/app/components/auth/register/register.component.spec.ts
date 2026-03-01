import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { RegisterComponent } from './register.component';
import { LoadingService } from '@shared/loading/loading.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockLoadingService,
  createMockPwaDetectionService,
  createMockAnalyticsService,
  createMockSnackBar,
} from '@testing/test-helpers';

// Mock hcaptcha global before tests run
const mockHcaptcha = {
  render: vi.fn(() => 'widget-id-123'),
  reset: vi.fn(),
};
(window as any).hcaptcha = mockHcaptcha;

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let el: HTMLElement;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;

  beforeEach(async () => {
    mockPwaDetection = createMockPwaDetectionService();

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: {} },
        { provide: getFunctions, useValue: {} },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: PwaDetectionService, useValue: mockPwaDetection },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the create account title', () => {
      expect(query('register-title')?.textContent?.trim()).toBe(
        'Create Account'
      );
    });

    it('should render the email input', () => {
      expect(query('register-email-input')).toBeTruthy();
    });

    it('should render the registration form', () => {
      expect(query('register-form')).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('should have required validation on email', () => {
      component.r.email.setValue('');
      component.r.email.markAsTouched();
      expect(component.r.email.hasError('required')).toBe(true);
    });

    it('should have email format validation', () => {
      component.r.email.setValue('notanemail');
      component.r.email.markAsTouched();
      expect(component.r.email.hasError('email')).toBe(true);
    });

    it('should have required validation on password', () => {
      component.r.password.setValue('');
      component.r.password.markAsTouched();
      expect(component.r.password.hasError('required')).toBe(true);
    });

    it('should detect password mismatch via custom validator', () => {
      component.r.email.setValue('test@example.com');
      component.r.password.setValue('password123');
      component.r.confirmPassword.setValue('differentpassword');
      expect(component.registerForm.errors?.['passwordMismatch']).toBe(true);
    });

    it('should pass password match validation when passwords are equal', () => {
      component.r.email.setValue('test@example.com');
      component.r.password.setValue('password123');
      component.r.confirmPassword.setValue('password123');
      expect(component.registerForm.errors?.['passwordMismatch']).toBeFalsy();
    });
  });

  describe('password visibility toggles', () => {
    it('should toggle hidePassword', () => {
      expect(component.hidePassword()).toBe(true);
      component.toggleHidePassword();
      expect(component.hidePassword()).toBe(false);
    });

    it('should toggle hideConfirmPassword', () => {
      expect(component.hideConfirmPassword()).toBe(true);
      component.toggleHideConfirmPassword();
      expect(component.hideConfirmPassword()).toBe(false);
    });
  });

  describe('platform detection', () => {
    it('should show app-download section when running in browser', () => {
      expect(query('app-download')).toBeTruthy();
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

  describe('passedCaptcha signal', () => {
    it('should start as false', () => {
      expect(component.passedCaptcha()).toBe(false);
    });
  });
});
