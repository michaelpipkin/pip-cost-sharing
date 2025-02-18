import { enableProdMode, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from '@env/environment';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  const analytics = inject(getAnalytics);
  logEvent(analytics, 'bootstrap_error', {
    error: err,
  });
});
