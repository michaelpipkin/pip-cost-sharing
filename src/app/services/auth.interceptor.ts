import { inject, Injectable } from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Observable } from 'rxjs';
import { AuthTokenService } from './auth-token.service';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  token = inject(AuthTokenService);
  analytics = inject(Analytics);

  constructor() {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (this.token.authJwtToken) {
      logEvent(this.analytics, 'auth_token_invoked', {
        httpRequest: req,
      });
      const cloned = req.clone({
        headers: req.headers.set('Authorization', this.token.authJwtToken),
      });
      return next.handle(cloned);
    } else {
      return next.handle(req);
    }
  }
}
