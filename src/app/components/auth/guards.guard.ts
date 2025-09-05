import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { ROUTE_PATHS } from '@constants/routes.constants';

export const groupGuard: CanActivateFn = () => {
  const router = inject(Router);
  const currentGroup = localStorage.getItem('currentGroup');
  if (currentGroup === null) {
    router.navigate([ROUTE_PATHS.ADMIN_GROUPS]);
    return false;
  }
  return true;
};

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(true);
      } else {
        resolve(router.navigate([ROUTE_PATHS.AUTH_LOGIN]));
      }
    });
  });
};

export const loggedInGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]));
      } else {
        resolve(true);
      }
    });
  });
};
