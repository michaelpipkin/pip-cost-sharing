import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { AnalyticsService } from './analytics.service';

const BASE_URL = 'https://pipsplit.com';

const INDEXABLE_ROUTES = new Set([
  '',
  '/',
  '/home',
  '/about',
  '/help',
  '/split',
  '/auth/login',
  '/auth/register',
]);

@Injectable({
  providedIn: 'root',
})
export class PageTitleStrategyService extends TitleStrategy {
  protected readonly title = inject(Title);
  protected readonly document = inject(DOCUMENT);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly meta = inject(Meta);
  protected readonly platformId = inject(PLATFORM_ID);

  constructor() {
    super();
  }

  override updateTitle(routerState: RouterStateSnapshot) {
    const title = this.buildTitle(routerState);
    const pageLink = routerState.url.split('?')[0] ?? '';
    const pageTitle = title === undefined ? 'PipSplit' : `PipSplit | ${title}`;

    this.title.setTitle(pageTitle);

    if (title !== undefined && isPlatformBrowser(this.platformId)) {
      const excludedScreens = [
        'Admin Statistics',
        'App Error Log',
        'Email Delivery Log',
      ];
      if (!excludedScreens.includes(title)) {
        this.analytics.logScreenView(title);
      }
    }

    this.updateCanonical(pageLink);

    const shouldIndex = INDEXABLE_ROUTES.has(pageLink);
    if (shouldIndex) {
      this.meta.removeTag('name="robots"');
    } else {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    }

    const leafRoute = this.getLeafRoute(routerState.root);
    const description = leafRoute.data['description'] as string | undefined;
    const ogTitle = (leafRoute.data['ogTitle'] as string | undefined) ?? pageTitle;
    const canonicalUrl = `${BASE_URL}${pageLink}`;

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ name: 'twitter:description', content: description });
    }
    this.meta.updateTag({ property: 'og:title', content: ogTitle });
    this.meta.updateTag({ name: 'twitter:title', content: ogTitle });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
  }

  private getLeafRoute(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route;
  }

  private updateCanonical(path: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', `${BASE_URL}${path}`);
  }
}
