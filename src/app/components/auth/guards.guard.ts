import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export const groupGuard: CanActivateFn = () => {
  const router = inject(Router);
  const currentGroup = localStorage.getItem('currentGroup');
  if (currentGroup === null) {
    router.navigate(['/groups']);
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
        resolve(router.navigate(['/login']));
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
        resolve(router.navigate(['/account']));
      } else {
        resolve(true);
      }
    });
  });
};
