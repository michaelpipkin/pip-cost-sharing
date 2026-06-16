import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

// The context argument (containing platformRef) is provided by @angular/ssr at runtime
// and must be forwarded as the third argument to bootstrapApplication in Angular 22+.
const bootstrap = (context: Parameters<typeof bootstrapApplication>[2]) =>
  bootstrapApplication(AppComponent, config, context);

export default bootstrap;
