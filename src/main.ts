import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from '@env/environment';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import './app/extensions/doc-ref-extensions';

if (environment.production) {
  enableProdMode();
}

bootstrapApplication(AppComponent, appConfig).catch((err) => {
  // Log bootstrap errors to console (cannot use Firebase Analytics here due to injection context)
  console.error('Bootstrap error:', err);
});
