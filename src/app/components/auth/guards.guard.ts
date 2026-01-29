import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { environment } from '@env/environment';
import { GroupStore } from '@store/group.store';
import { Auth, getAuth, onAuthStateChanged, User } from 'firebase/auth';

// AdSense crawler user email - this user should bypass group requirements
const ADSENSE_CRAWLER_EMAIL = 'adsensecrawler@google.com';

// App owner email - pulled from environment for prod/emulator flexibility
export const APP_OWNER_EMAIL = environment.appOwnerEmail;

// Helper function to wait for initial auth state to be determined
// This resolves immediately once Firebase has loaded the persisted auth state
// and cleans up the subscription to prevent listening to future auth changes
function waitForAuthInit(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Clean up immediately after first callback
      resolve(user);
    });
  });
}

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

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  // Wait for Firebase to determine initial auth state (handles page refresh)
  // This only waits for the first state determination, not future changes
  const user = await waitForAuthInit(auth);

  if (user) {
    const isGoogleUser = user.providerData[0]?.providerId === 'google.com';
    const isEmailConfirmed = user.emailVerified;

    if (isGoogleUser || isEmailConfirmed) {
      return true;
    } else {
      return router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]);
    }
  } else {
    // Don't redirect if we're on the delete account page
    // This prevents interrupting the deletion confirmation message
    if (router.url.includes('/auth/delete-account')) {
      return false;
    }
    return router.navigate([ROUTE_PATHS.AUTH_LOGIN]);
  }
};

export const basicAuthGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  // Wait for Firebase to determine initial auth state (handles page refresh)
  // This only waits for the first state determination, not future changes
  const user = await waitForAuthInit(auth);

  if (user) {
    return true;
  } else {
    // Don't redirect if we're on the delete account page
    // This prevents interrupting the deletion confirmation message
    if (router.url.includes('/auth/delete-account')) {
      return false;
    }
    return router.navigate([ROUTE_PATHS.AUTH_LOGIN]);
  }
};

export const loggedInGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  // Wait for Firebase to determine initial auth state (handles page refresh)
  // This only waits for the first state determination, not future changes
  const user = await waitForAuthInit(auth);

  if (user) {
    const isGoogleUser = user.providerData[0]?.providerId === 'google.com';
    const isEmailConfirmed = user.emailVerified;

    // Redirect validated users to expenses, unvalidated users to account
    if (isGoogleUser || isEmailConfirmed) {
      //   return router.navigate([ROUTE_PATHS.EXPENSES_ROOT]);
      // } else {
      return router.navigate([ROUTE_PATHS.AUTH_ACCOUNT]);
    }
  } else {
    return true;
  }
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

export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(getAuth);

  const user = await waitForAuthInit(auth);

  if (user && user.email === APP_OWNER_EMAIL) {
    return true;
  } else {
    router.navigate([ROUTE_PATHS.HOME]);
    return false;
  }
};
