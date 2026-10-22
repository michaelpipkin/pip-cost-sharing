import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { GroupEmailUpdateDialogComponent } from '@features/auth/group-email-update-dialog/group-email-update-dialog.component';
import { LoadingComponent } from '@components/loading/loading.component';
import { LoadingService } from '@components/loading/loading.service';
import { NavigationLoadingService } from '@components/loading/navigation-loading.service';
import { AdMobService } from '@services/admob.service';
import { AdSenseService } from '@services/adsense.service';
import { AnalyticsService } from '@services/analytics.service';
import { DeepLinkService } from '@services/deep-link.service';
import { MediaQueryService } from '@services/media-query.service';
import { MemberService } from '@services/member.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { ThemeService } from '@services/theme.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMediaQueryService,
  createMockPwaDetectionService,
  createMockThemeService,
  createMockUserStore,
  mockDocRef,
  mockUser,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';

// Stub to prevent LoadingComponent's DomPortalOutlet from corrupting the DOM between tests
@Component({ selector: 'loading', template: '' })
class MockLoadingComponent {}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let mockThemeService: ReturnType<typeof createMockThemeService>;
  let mockUserService: {
    logout: ReturnType<typeof vi.fn>;
  };
  let userStore: ReturnType<typeof createMockUserStore>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  const mockMemberService = { getLinkedMemberEmails: vi.fn() };

  const mockAdMobService = {
    initialize: vi.fn(),
    showBanner: vi.fn(),
    hideBanner: vi.fn(),
  };

  const mockAdSenseService = {
    initialize: vi.fn(),
  };

  const mockDeepLinkService = {
    initialize: vi.fn(),
  };

  const mockNavigationLoadingService = {
    isLoading: vi.fn(() => false),
  };

  beforeEach(async () => {
    mockThemeService = createMockThemeService();
    mockUserService = { logout: vi.fn() };
    userStore = createMockUserStore();
    mockDialog = createMockMatDialog();
    mockMemberService.getLinkedMemberEmails.mockReset();

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: UserStore, useValue: userStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MemberService, useValue: mockMemberService },
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: UserService, useValue: mockUserService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        {
          provide: PwaDetectionService,
          useValue: createMockPwaDetectionService(),
        },
        { provide: MediaQueryService, useValue: createMockMediaQueryService() },
        { provide: AdMobService, useValue: mockAdMobService },
        { provide: AdSenseService, useValue: mockAdSenseService },
        { provide: DeepLinkService, useValue: mockDeepLinkService },
        {
          provide: NavigationLoadingService,
          useValue: mockNavigationLoadingService,
        },
        { provide: LoadingService, useValue: createMockLoadingService() },
      ],
    })
      .overrideComponent(AppComponent, {
        remove: { imports: [LoadingComponent] },
        add: { imports: [MockLoadingComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have title "PipSplit"', () => {
    expect(component.title).toBe('PipSplit');
  });

  describe('toggleTheme', () => {
    it('should call themeService.toggleTheme', () => {
      component.toggleTheme();
      expect(mockThemeService.toggleTheme).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should call userService.logout', () => {
      component.logout();
      expect(mockUserService.logout).toHaveBeenCalled();
    });
  });

  describe('store signal integration', () => {
    it('should expose isLoggedIn from userStore', () => {
      expect(component.isLoggedIn()).toBe(false);
    });

    it('should expose isValidUser from userStore', () => {
      expect(component.isValidUser()).toBe(false);
    });
  });

  describe('deepLinkService.initialize', () => {
    it('should call deepLinkService.initialize on construction', () => {
      expect(mockDeepLinkService.initialize).toHaveBeenCalled();
    });
  });

  // B20: after a login-email change the app offers to update group emails.
  describe('group email update offer', () => {
    const uid = 'user-1';
    const userRef = mockDocRef('users/user-1');
    const prompt = { uid, oldEmail: 'Old@Test.com', newEmail: 'new@test.com' };

    function signIn(valid = true): void {
      userStore.initUser(
        mockUser({ id: uid, email: prompt.newEmail, ref: userRef }),
        false,
        valid
      );
    }

    async function settle(): Promise<void> {
      await fixture.whenStable();
      await vi.waitFor(() => expect(userStore.groupEmailPrompt()).toBeNull());
      await fixture.whenStable();
    }

    it('opens the dialog with the counts when some memberships differ from the new email', async () => {
      // 2 on the old email (any case), 1 custom, 1 already on the new one
      mockMemberService.getLinkedMemberEmails.mockResolvedValue([
        'old@test.com',
        'OLD@test.com',
        'work@corp.com',
        'New@Test.com',
      ]);
      signIn();
      userStore.setGroupEmailPrompt(prompt);

      await settle();

      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalledTimes(1));
      expect(mockMemberService.getLinkedMemberEmails).toHaveBeenCalledWith(
        userRef
      );
      expect(mockDialog.open).toHaveBeenCalledWith(
        GroupEmailUpdateDialogComponent,
        {
          data: {
            oldEmail: 'Old@Test.com',
            newEmail: 'new@test.com',
            total: 3,
            onOldEmail: 2,
          },
        }
      );
    });

    it('shows nothing when every membership already uses the new email', async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue([
        'new@test.com',
        'NEW@test.com',
      ]);
      signIn();
      userStore.setGroupEmailPrompt(prompt);

      await settle();
      await fixture.whenStable();

      expect(mockMemberService.getLinkedMemberEmails).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('shows nothing when the user has no memberships', async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue([]);
      signIn();
      userStore.setGroupEmailPrompt(prompt);

      await settle();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('opens once per change, however often the state changes afterwards', async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue(['a@x.com']);
      signIn();
      userStore.setGroupEmailPrompt(prompt);
      await settle();
      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalledTimes(1));

      userStore.updateUser({ venmoId: 'x' });
      signIn();
      await fixture.whenStable();

      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(mockMemberService.getLinkedMemberEmails).toHaveBeenCalledTimes(1);
    });

    it('waits for a signed-in user, then offers once they sign in', async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue(['a@x.com']);
      userStore.setGroupEmailPrompt(prompt);
      await fixture.whenStable();

      expect(mockMemberService.getLinkedMemberEmails).not.toHaveBeenCalled();
      expect(userStore.groupEmailPrompt()).toEqual(prompt);

      signIn();
      await settle();

      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalledTimes(1));
    });

    it('waits while the user is not validated (email unverified)', async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue(['a@x.com']);
      signIn(false);
      userStore.setGroupEmailPrompt(prompt);
      await fixture.whenStable();

      expect(mockMemberService.getLinkedMemberEmails).not.toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it("drops another account's prompt without opening anything", async () => {
      mockMemberService.getLinkedMemberEmails.mockResolvedValue(['a@x.com']);
      signIn();
      userStore.setGroupEmailPrompt({ ...prompt, uid: 'someone-else' });

      await settle();

      expect(mockMemberService.getLinkedMemberEmails).not.toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('shows nothing, and does not throw, when the memberships cannot be read', async () => {
      mockMemberService.getLinkedMemberEmails.mockRejectedValue(
        new Error('offline')
      );
      signIn();
      userStore.setGroupEmailPrompt(prompt);

      await settle();
      await fixture.whenStable();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });
});
