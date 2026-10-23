import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router, Routes } from '@angular/router';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockAnalyticsService,
  createMockMatDialog,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { LoadingService } from './loading.service';
import { NavigationLoadingService } from './navigation-loading.service';

@Component({ selector: 'app-nav-loading-stub', template: '' })
class StubComponent {}

describe('NavigationLoadingService', () => {
  let router: Router;
  let loading: LoadingService;
  let dialog: ReturnType<typeof createMockMatDialog>;
  let analytics: ReturnType<typeof createMockAnalyticsService>;
  // Settles the loader of the 'slow' route
  let releaseSlow: (() => void) | undefined;
  // What the 'broken' route's loader rejects with
  let brokenError: unknown;

  // Built per test: Angular caches a lazily loaded component on the route object
  const buildRoutes = (): Routes => [
    { path: 'ok', component: StubComponent },
    {
      path: 'slow',
      loadComponent: () =>
        new Promise<typeof StubComponent>((resolve) => {
          releaseSlow = () => resolve(StubComponent);
        }),
    },
    {
      path: 'broken',
      loadComponent: () => Promise.reject(brokenError),
    },
    { path: 'blocked', component: StubComponent, canActivate: [() => false] },
  ];

  /** Navigates and swallows the rejection a NavigationError produces. */
  async function navigate(url: string): Promise<void> {
    try {
      await router.navigateByUrl(url);
    } catch {
      // expected for the 'broken' route
    }
  }

  beforeEach(() => {
    releaseSlow = undefined;
    dialog = createMockMatDialog();
    analytics = createMockAnalyticsService();
    // The mock dialog's afterClosed() never calls back, so the service's
    // location.reload() (which jsdom cannot perform) can never run here.

    TestBed.configureTestingModule({
      providers: [
        provideRouter(buildRoutes()),
        provideLocationMocks(),
        { provide: MatDialog, useValue: dialog },
        { provide: AnalyticsService, useValue: analytics },
      ],
    });
    router = TestBed.inject(Router);
    loading = TestBed.inject(LoadingService);
    TestBed.inject(NavigationLoadingService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loading state', () => {
    it('should turn the navigation source on at NavigationStart and off at NavigationEnd', async () => {
      const navigation = router.navigateByUrl('/slow');
      // the route's loader is still pending, so the navigation is in flight
      await vi.waitFor(() => expect(releaseSlow).toBeDefined());
      expect(loading.loading()).toBe(true);

      releaseSlow!();
      await navigation;

      expect(loading.loading()).toBe(false);
    });

    it('should turn the navigation source off at NavigationCancel', async () => {
      const result = await router.navigateByUrl('/blocked');

      expect(result).toBe(false);
      expect(loading.loading()).toBe(false);
    });

    it('should leave a source other than navigation alone', async () => {
      loading.loadingOn('content');

      await router.navigateByUrl('/ok');

      expect(loading.loading()).toBe(true);
    });

    it('should turn the navigation source off when the navigation errors', async () => {
      brokenError = new Error('boom');

      await navigate('/broken');

      expect(loading.loading()).toBe(false);
    });
  });

  describe('stale module errors', () => {
    it.each([
      'Failed to fetch dynamically imported module: https://x/chunk.js',
      'Importing a module script failed.',
      'error loading dynamically imported module: https://x/chunk.js',
    ])(
      'should prompt for an app update on "%s" and not log it',
      async (msg) => {
        brokenError = new Error(msg);

        await navigate('/broken');

        expect(dialog.open).toHaveBeenCalledTimes(1);
        const [component, config] = dialog.open.mock.calls[0] as unknown as [
          unknown,
          { data: { dialogTitle: string }; disableClose: boolean },
        ];
        expect(component).toBe(ConfirmDialogComponent);
        expect(config.data.dialogTitle).toBe('App Update Available');
        expect(config.disableClose).toBe(true);
        expect(analytics.logError).not.toHaveBeenCalled();
      }
    );
  });

  describe('other navigation errors', () => {
    it('should log an Error with its message and the failed url, and open no dialog', async () => {
      brokenError = new Error('Something else broke');

      await navigate('/broken');

      expect(analytics.logError).toHaveBeenCalledWith(
        'Navigation Loading Service',
        'navigation',
        '/broken',
        'Something else broke'
      );
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('should log a non-Error rejection as its string form', async () => {
      brokenError = 'plain string failure';

      await navigate('/broken');

      expect(analytics.logError).toHaveBeenCalledWith(
        'Navigation Loading Service',
        'navigation',
        '/broken',
        'plain string failure'
      );
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('should not treat a message that merely contains the stale-module text as stale', async () => {
      brokenError = new Error(
        'Wrapped: Failed to fetch dynamically imported module'
      );

      await navigate('/broken');

      expect(dialog.open).not.toHaveBeenCalled();
      expect(analytics.logError).toHaveBeenCalledTimes(1);
    });
  });
});
