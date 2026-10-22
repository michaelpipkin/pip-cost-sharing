import { TestBed } from '@angular/core/testing';
import { mockUser } from '@testing/test-helpers';
import { describe, expect, it } from 'vitest';
import { UserStore } from './user.store';

describe('UserStore', () => {
  function setup() {
    return TestBed.inject(UserStore);
  }

  describe('updateUser', () => {
    it('should merge the changes into the current user', () => {
      const store = setup();
      store.initUser(
        mockUser({ venmoId: 'old', paypalId: 'keep' }),
        false,
        true
      );

      store.updateUser({ venmoId: 'new' });

      expect(store.user()?.venmoId).toBe('new');
      expect(store.user()?.paypalId).toBe('keep');
      expect(store.user()?.email).toBe('test@example.com');
    });

    it('should replace the user object rather than mutate it', () => {
      const store = setup();
      const original = mockUser({ venmoId: 'old' });
      store.initUser(original, false, true);

      store.updateUser({ venmoId: 'new' });

      expect(store.user()).not.toBe(original);
      expect(original.venmoId).toBe('old');
    });

    it('should do nothing when there is no user', () => {
      const store = setup();

      store.updateUser({ venmoId: 'new' });

      expect(store.user()).toBeNull();
      expect(store.isLoggedIn()).toBe(false);
    });
  });

  describe('isValidUser', () => {
    it.each([
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ])(
      'with isGoogleUser=%s and isEmailConfirmed=%s should be %s',
      (google, confirmed, expected) => {
        const store = setup();
        store.setIsGoogleUser(google);
        store.setIsEmailConfirmed(confirmed);

        expect(store.isValidUser()).toBe(expected);
      }
    );
  });

  describe('initUser / isLoggedIn', () => {
    it('should store the user and flags and report logged in', () => {
      const store = setup();
      const user = mockUser();

      store.initUser(user, true, false);

      expect(store.user()).toBe(user);
      expect(store.isGoogleUser()).toBe(true);
      expect(store.isEmailConfirmed()).toBe(false);
      expect(store.isLoggedIn()).toBe(true);
    });
  });

  describe('clearUser', () => {
    it('should reset the user and both flags', () => {
      const store = setup();
      store.initUser(mockUser(), true, true);
      expect(store.isValidUser()).toBe(true);

      store.clearUser();

      expect(store.user()).toBeNull();
      expect(store.isGoogleUser()).toBe(false);
      expect(store.isEmailConfirmed()).toBe(false);
      expect(store.isLoggedIn()).toBe(false);
      expect(store.isValidUser()).toBe(false);
    });
  });
});
