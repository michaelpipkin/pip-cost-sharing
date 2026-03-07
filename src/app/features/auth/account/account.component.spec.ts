import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { By } from '@angular/platform-browser';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { AccountComponent } from './account.component';
import { UserStore } from '@store/user.store';
import { APP_OWNER_EMAIL } from '@features/auth/guards.guard';
import { createMockUserStore, mockUser } from '@testing/test-helpers';

describe('AccountComponent', () => {
  let fixture: ComponentFixture<AccountComponent>;
  let component: AccountComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;

  const mockAuthWithUser = {
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
    },
  };

  const mockAuthAsAdmin = {
    currentUser: {
      email: APP_OWNER_EMAIL,
      emailVerified: true,
    },
  };

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  async function createComponent(authValue = mockAuthWithUser): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser());

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: authValue },
        { provide: getFunctions, useValue: {} },
        { provide: UserStore, useValue: mockUserStore },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  describe('email verification banner', () => {
    it('should show banner for unverified non-Google users', async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(false);
      mockUserStore.isEmailConfirmed.set(false);
      fixture.detectChanges();
      const banner = fixture.debugElement.query(
        By.css('[data-testid="email-verification-banner"]')
      );
      expect(banner).toBeTruthy();
    });

    it('should hide banner for Google users', async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(true);
      mockUserStore.isEmailConfirmed.set(false);
      fixture.detectChanges();
      const banner = fixture.debugElement.query(
        By.css('[data-testid="email-verification-banner"]')
      );
      expect(banner).toBeNull();
    });

    it('should hide banner when email is confirmed', async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(false);
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
      const banner = fixture.debugElement.query(
        By.css('[data-testid="email-verification-banner"]')
      );
      expect(banner).toBeNull();
    });
  });

  describe('navigation sidebar', () => {
    it('should render all standard nav items', async () => {
      await createComponent();
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
      expect(
        fixture.debugElement.query(By.css('[data-testid="nav-profile"]'))
      ).toBeTruthy();
      expect(
        fixture.debugElement.query(By.css('[data-testid="nav-security"]'))
      ).toBeTruthy();
      expect(
        fixture.debugElement.query(By.css('[data-testid="nav-payments"]'))
      ).toBeTruthy();
      expect(
        fixture.debugElement.query(By.css('[data-testid="nav-legal"]'))
      ).toBeTruthy();
    });

    it('should hide admin nav item for non-admin users', async () => {
      await createComponent();
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
      const adminLink = fixture.debugElement.query(
        By.css('[data-testid="nav-admin"]')
      );
      expect(adminLink).toBeNull();
    });

    it('should show admin nav item for admin user', async () => {
      await createComponent(mockAuthAsAdmin);
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
      const adminLink = fixture.debugElement.query(
        By.css('[data-testid="nav-admin"]')
      );
      expect(adminLink).toBeTruthy();
    });

    it('should hide security nav item for Google users', async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(true);
      fixture.detectChanges();
      const securityLink = fixture.debugElement.query(
        By.css('[data-testid="nav-security"]')
      );
      expect(securityLink).toBeNull();
    });
  });

  describe('navigateToList', () => {
    it('should navigate to /auth/account', async () => {
      await createComponent();
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.navigateToList();
      expect(navigateSpy).toHaveBeenCalledWith(['/auth/account']);
    });
  });
});
