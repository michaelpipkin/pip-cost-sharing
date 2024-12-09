import { enableProdMode, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  const analytics = inject(getAnalytics);
  logEvent(analytics, 'bootstrap_error', {
    error: err,
  });
});
