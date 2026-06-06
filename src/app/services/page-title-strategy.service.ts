import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { AnalyticsService } from './analytics.service';

@Injectable({
  providedIn: 'root',
})
export class PageTitleStrategyService extends TitleStrategy {
  protected readonly title = inject(Title);
  protected readonly document = inject(DOCUMENT);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly meta = inject(Meta);

  constructor() {
    super();
  }

  override updateTitle(routerState: RouterStateSnapshot) {
    const title = this.buildTitle(routerState);
    const pageLink = routerState.url.split('?')[0]!; // strip query params
    if (title !== undefined) {
      this.title.setTitle(`PipSplit | ${title}`);
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

    const indexableRoutes = [
      '',
      '/',
      '/home',
      '/about',
      '/help',
      '/split',
      '/auth/login',
      '/auth/register',
    ];
    const shouldIndex = indexableRoutes.includes(pageLink);
    if (shouldIndex) {
      this.meta.removeTag('name="robots"');
    } else {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    }
  }

  private updateCanonical(path: string): void {
    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', `https://pipsplit.com${path}`);
  }
}
