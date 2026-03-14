import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { AnalyticsService } from './analytics.service';

@Injectable({
  providedIn: 'root',
})
export class PageTitleStrategyService extends TitleStrategy {
  protected readonly title = inject(Title);
  protected readonly analytics = inject(AnalyticsService);

  constructor() {
    super();
  }

  override updateTitle(routerState: RouterStateSnapshot) {
    const title = this.buildTitle(routerState);
    if (title !== undefined) {
      this.title.setTitle(`PipSplit | ${title}`);
      const excludedScreens = ['Admin Statistics', 'App Error Log', 'Email Delivery Log'];
      if (!excludedScreens.includes(title)) {
        this.analytics.logScreenView(title);
      }
    }
  }
}
