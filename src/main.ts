import { enableProdMode, inject } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  const analytics = inject(Analytics);
  logEvent(analytics, 'bootstrap_error', {
    error: err,
  });
});
