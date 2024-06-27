import { Injectable } from '@angular/core';
import { Auth, idToken } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthTokenService {
  authJwtToken: string;

  constructor(auth: Auth) {
    idToken(auth).subscribe((jwt) => (this.authJwtToken = jwt));
  }
}
