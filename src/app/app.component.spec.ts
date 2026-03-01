import { Component } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { AppComponent } from './app.component';
import { LoadingComponent } from './shared/loading/loading.component';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { UserService } from '@services/user.service';
import { DemoService } from '@services/demo.service';
import { ThemeService } from '@services/theme.service';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { AdMobService } from '@services/admob.service';
import { AdSenseService } from '@services/adsense.service';
import { DeepLinkService } from '@services/deep-link.service';
import { NavigationLoadingService } from './shared/loading/navigation-loading.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockUserStore,
  createMockGroupStore,
  createMockDemoService,
  createMockAnalyticsService,
  createMockPwaDetectionService,
  createMockThemeService,
  createMockLoadingService,
} from '@testing/test-helpers';

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

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({ subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) })),
  };

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

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: UserStore, useValue: createMockUserStore() },
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: UserService, useValue: mockUserService },
        { provide: DemoService, useValue: createMockDemoService() },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: PwaDetectionService, useValue: createMockPwaDetectionService() },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        { provide: AdMobService, useValue: mockAdMobService },
        { provide: AdSenseService, useValue: mockAdSenseService },
        { provide: DeepLinkService, useValue: mockDeepLinkService },
        { provide: NavigationLoadingService, useValue: mockNavigationLoadingService },
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

  it('should have title "Cost Sharing"', () => {
    expect(component.title).toBe('Cost Sharing');
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
});
