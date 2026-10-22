import { TestBed } from '@angular/core/testing';
import { mockGroup } from '@testing/test-helpers';
import { describe, expect, it } from 'vitest';
import { GroupStore } from './group.store';

describe('GroupStore', () => {
  function setup() {
    return TestBed.inject(GroupStore);
  }

  describe('setAllUserGroups / clearAllUserGroups', () => {
    it('should store the groups and mark the store loaded', () => {
      const store = setup();
      expect(store.loaded()).toBe(false);
      const groups = [mockGroup({ id: 'a' }), mockGroup({ id: 'b' })];

      store.setAllUserGroups(groups);

      expect(store.allUserGroups()).toEqual(groups);
      expect(store.loaded()).toBe(true);
    });

    it('should reset groups, current group and loaded, but leave skipAutoSelect alone', () => {
      const store = setup();
      store.setAllUserGroups([mockGroup({ id: 'a' })]);
      store.clearCurrentGroup(true);
      store.setCurrentGroup(mockGroup({ id: 'a' }));
      expect(store.skipAutoSelect()).toBe(true);

      store.clearAllUserGroups();

      expect(store.allUserGroups()).toEqual([]);
      expect(store.currentGroup()).toBeNull();
      expect(store.loaded()).toBe(false);
      expect(store.skipAutoSelect()).toBe(true);
    });
  });

  describe('removeGroup', () => {
    it('should remove only the group with the matching id', () => {
      const store = setup();
      const a = mockGroup({ id: 'a' });
      const b = mockGroup({ id: 'b' });
      const c = mockGroup({ id: 'c' });
      store.setAllUserGroups([a, b, c]);

      store.removeGroup('b');

      expect(store.allUserGroups()).toEqual([a, c]);
    });

    it('should leave the list unchanged for an unknown id', () => {
      const store = setup();
      const a = mockGroup({ id: 'a' });
      store.setAllUserGroups([a]);

      store.removeGroup('nope');

      expect(store.allUserGroups()).toEqual([a]);
    });
  });

  describe('patchGroupMembership', () => {
    it('should patch only the named group, moving it from active to left', () => {
      const store = setup();
      const a = mockGroup({ id: 'a', userActiveInGroup: true });
      const b = mockGroup({ id: 'b', userActiveInGroup: true });
      store.setAllUserGroups([a, b]);
      expect(store.activeUserGroups().map((g) => g.id)).toEqual(['a', 'b']);
      expect(store.leftUserGroups()).toEqual([]);

      store.patchGroupMembership('a', {
        userActiveInGroup: false,
        userLeftGroup: true,
      });

      const [patchedA, untouchedB] = store.allUserGroups();
      expect(patchedA!.userActiveInGroup).toBe(false);
      expect(patchedA!.userLeftGroup).toBe(true);
      expect(untouchedB).toBe(b);
      expect(store.activeUserGroups().map((g) => g.id)).toEqual(['b']);
      expect(store.leftUserGroups().map((g) => g.id)).toEqual(['a']);
    });

    it('should keep the group fields the patch does not name', () => {
      const store = setup();
      store.setAllUserGroups([mockGroup({ id: 'a', name: 'Beach' })]);

      store.patchGroupMembership('a', { userIsAdmin: false });

      expect(store.allUserGroups()[0]!.name).toBe('Beach');
      expect(store.allUserGroups()[0]!.userIsAdmin).toBe(false);
    });
  });

  describe('activeUserGroups', () => {
    // Each condition is varied alone: the group is otherwise active, the
    // user is active in it and it is not archived.
    it('should include a group that is active, user-active and not archived', () => {
      const store = setup();
      store.setAllUserGroups([mockGroup({ id: 'ok' })]);

      expect(store.activeUserGroups().map((g) => g.id)).toEqual(['ok']);
    });

    it('should exclude a group that is not active', () => {
      const store = setup();
      store.setAllUserGroups([mockGroup({ id: 'x', active: false })]);

      expect(store.activeUserGroups()).toEqual([]);
    });

    it('should exclude a group the user is not active in', () => {
      const store = setup();
      store.setAllUserGroups([
        mockGroup({ id: 'x', userActiveInGroup: false }),
      ]);

      expect(store.activeUserGroups()).toEqual([]);
    });

    it('should exclude an archived group', () => {
      const store = setup();
      store.setAllUserGroups([mockGroup({ id: 'x', archived: true })]);

      expect(store.activeUserGroups()).toEqual([]);
    });
  });

  describe('userAdminGroups / leftUserGroups', () => {
    it('should list only groups the user administers', () => {
      const store = setup();
      store.setAllUserGroups([
        mockGroup({ id: 'a', userIsAdmin: true }),
        mockGroup({ id: 'b', userIsAdmin: false }),
      ]);

      expect(store.userAdminGroups().map((g) => g.id)).toEqual(['a']);
    });

    it('should list only groups the user left', () => {
      const store = setup();
      store.setAllUserGroups([
        mockGroup({ id: 'a', userLeftGroup: true }),
        mockGroup({ id: 'b' }),
      ]);

      expect(store.leftUserGroups().map((g) => g.id)).toEqual(['a']);
    });
  });

  describe('current group and skipAutoSelect', () => {
    it('should set the current group', () => {
      const store = setup();
      const g = mockGroup({ id: 'a' });

      store.setCurrentGroup(g);

      expect(store.currentGroup()).toBe(g);
    });

    it('should clear the current group without setting skipAutoSelect by default', () => {
      const store = setup();
      store.setCurrentGroup(mockGroup());

      store.clearCurrentGroup();

      expect(store.currentGroup()).toBeNull();
      expect(store.skipAutoSelect()).toBe(false);
    });

    it('should set skipAutoSelect when clearCurrentGroup(true) is called', () => {
      const store = setup();
      store.setCurrentGroup(mockGroup());

      store.clearCurrentGroup(true);

      expect(store.currentGroup()).toBeNull();
      expect(store.skipAutoSelect()).toBe(true);
    });

    it('should reset skipAutoSelect with a plain clearCurrentGroup() after a skipping one', () => {
      const store = setup();
      store.clearCurrentGroup(true);

      store.clearCurrentGroup();

      expect(store.skipAutoSelect()).toBe(false);
    });

    it('should clear skipAutoSelect with resetSkipAutoSelect', () => {
      const store = setup();
      store.clearCurrentGroup(true);
      expect(store.skipAutoSelect()).toBe(true);

      store.resetSkipAutoSelect();

      expect(store.skipAutoSelect()).toBe(false);
    });
  });

  it('should set loaded directly with setLoadedState', () => {
    const store = setup();

    store.setLoadedState(true);
    expect(store.loaded()).toBe(true);

    store.setLoadedState(false);
    expect(store.loaded()).toBe(false);
  });
});
