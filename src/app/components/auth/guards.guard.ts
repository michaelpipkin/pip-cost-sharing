import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { GroupStore } from '@store/group.store';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// AdSense crawler user email - this user should bypass group requirements
const ADSENSE_CRAWLER_EMAIL = 'adsensecrawler@google.com';

export const groupGuard: CanActivateFn = () => {
  const router = inject(Router);
  const groupStore = inject(GroupStore);
  const auth = inject(getAuth);

  // Allow AdSense crawler to bypass group requirement
  if (auth.currentUser?.email === ADSENSE_CRAWLER_EMAIL) {
    return true;
  }

  if (groupStore.loaded() && !groupStore.currentGroup()) {
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
        const isGoogleUser = user.providerData[0]?.providerId === 'google.com';
        const isEmailConfirmed = user.emailVerified;

        if (isGoogleUser || isEmailConfirmed) {
          resolve(true);
        } else {
          resolve(router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]));
        }
      } else {
        resolve(router.navigate([ROUTE_PATHS.AUTH_LOGIN]));
      }
    });
  });
};

export const basicAuthGuard: CanActivateFn = () => {
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
        const isGoogleUser = user.providerData[0]?.providerId === 'google.com';
        const isEmailConfirmed = user.emailVerified;

        // Redirect validated users to expenses, unvalidated users to account
        if (isGoogleUser || isEmailConfirmed) {
          //   resolve(router.navigate([ROUTE_PATHS.EXPENSES_ROOT]));
          // } else {
          resolve(router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]));
        }
      } else {
        resolve(true);
      }
    });
  });
};

export const noCrawlerGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  // Block AdSense crawler from accessing add/edit routes
  if (auth.currentUser?.email === ADSENSE_CRAWLER_EMAIL) {
    router.navigate([ROUTE_PATHS.HOME]);
    return false;
  }
  return true;
};
