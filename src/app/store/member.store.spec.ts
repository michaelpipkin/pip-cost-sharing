import { TestBed } from '@angular/core/testing';
import { mockDocRef, mockMember } from '@testing/test-helpers';
import { describe, expect, it } from 'vitest';
import { MemberStore } from './member.store';

describe('MemberStore', () => {
  function setup() {
    return TestBed.inject(MemberStore);
  }

  describe('getMemberByRef', () => {
    it('should match by path on a different ref instance', () => {
      const store = setup();
      const alice = mockMember({
        id: 'm1',
        ref: mockDocRef('groups/g/members/m1'),
      });
      const bob = mockMember({
        id: 'm2',
        ref: mockDocRef('groups/g/members/m2'),
      });
      store.setGroupMembers([alice, bob]);

      const found = store.getMemberByRef(mockDocRef('groups/g/members/m2'));

      expect(found).toBe(bob);
    });

    it('should return undefined for an unknown ref', () => {
      const store = setup();
      store.setGroupMembers([mockMember()]);

      expect(
        store.getMemberByRef(mockDocRef('groups/g/members/other'))
      ).toBeUndefined();
    });

    it('should return undefined for a null ref', () => {
      const store = setup();
      store.setGroupMembers([mockMember()]);

      expect(store.getMemberByRef(null)).toBeUndefined();
    });

    it('should return undefined for an undefined ref', () => {
      const store = setup();
      store.setGroupMembers([mockMember()]);

      expect(store.getMemberByRef(undefined)).toBeUndefined();
    });

    it('should skip members that have no ref', () => {
      const store = setup();
      const target = mockMember({
        id: 'm2',
        ref: mockDocRef('groups/g/members/m2'),
      });
      store.setGroupMembers([mockMember({ id: 'm1', ref: undefined }), target]);

      expect(store.getMemberByRef(mockDocRef('groups/g/members/m2'))).toBe(
        target
      );
    });
  });

  describe('activeGroupMembers', () => {
    it('should list only active members', () => {
      const store = setup();
      store.setGroupMembers([
        mockMember({ id: 'a', active: true }),
        mockMember({ id: 'b', active: false }),
        mockMember({ id: 'c', active: true }),
      ]);

      expect(store.activeGroupMembers().map((m) => m.id)).toEqual(['a', 'c']);
    });
  });

  describe('setGroupMembers / clearGroupMembers', () => {
    it('should store the members and mark the store loaded', () => {
      const store = setup();
      expect(store.loaded()).toBe(false);

      store.setGroupMembers([mockMember()]);

      expect(store.groupMembers()).toHaveLength(1);
      expect(store.loaded()).toBe(true);
    });

    it('should reset members, current member and loaded when cleared', () => {
      const store = setup();
      store.setGroupMembers([mockMember()]);
      store.setCurrentMember(mockMember());

      store.clearGroupMembers();

      expect(store.groupMembers()).toEqual([]);
      expect(store.currentMember()).toBeNull();
      expect(store.loaded()).toBe(false);
    });
  });

  describe('current member', () => {
    it('should set and clear the current member without touching the list', () => {
      const store = setup();
      const me = mockMember({ id: 'me' });
      store.setGroupMembers([me]);

      store.setCurrentMember(me);
      expect(store.currentMember()).toBe(me);

      store.clearCurrentMember();
      expect(store.currentMember()).toBeNull();
      expect(store.groupMembers()).toEqual([me]);
      expect(store.loaded()).toBe(true);
    });
  });
});
