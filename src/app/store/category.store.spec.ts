import { TestBed } from '@angular/core/testing';
import { mockCategory, mockDocRef } from '@testing/test-helpers';
import { describe, expect, it } from 'vitest';
import { CategoryStore } from './category.store';

describe('CategoryStore', () => {
  function setup() {
    return TestBed.inject(CategoryStore);
  }

  describe('getCategoryByRef', () => {
    it('should match by path on a different ref instance', () => {
      const store = setup();
      const food = mockCategory({
        id: 'c1',
        ref: mockDocRef('groups/g/categories/c1'),
      });
      const fuel = mockCategory({
        id: 'c2',
        ref: mockDocRef('groups/g/categories/c2'),
      });
      store.setGroupCategories([food, fuel]);

      expect(store.getCategoryByRef(mockDocRef('groups/g/categories/c2'))).toBe(
        fuel
      );
    });

    it('should return undefined for an unknown ref', () => {
      const store = setup();
      store.setGroupCategories([mockCategory()]);

      expect(
        store.getCategoryByRef(mockDocRef('groups/g/categories/other'))
      ).toBeUndefined();
    });

    it('should return undefined for a null ref', () => {
      const store = setup();
      store.setGroupCategories([mockCategory()]);

      expect(store.getCategoryByRef(null)).toBeUndefined();
    });

    it('should return undefined for an undefined ref', () => {
      const store = setup();
      store.setGroupCategories([mockCategory()]);

      expect(store.getCategoryByRef(undefined)).toBeUndefined();
    });
  });

  describe('activeGroupCategories', () => {
    it('should list only active categories', () => {
      const store = setup();
      store.setGroupCategories([
        mockCategory({ id: 'a', active: true }),
        mockCategory({ id: 'b', active: false }),
      ]);

      expect(store.activeGroupCategories().map((c) => c.id)).toEqual(['a']);
    });
  });

  describe('setGroupCategories / clearGroupCategories', () => {
    it('should store the categories and mark the store loaded', () => {
      const store = setup();
      expect(store.loaded()).toBe(false);

      store.setGroupCategories([mockCategory()]);

      expect(store.groupCategories()).toHaveLength(1);
      expect(store.loaded()).toBe(true);
    });

    it('should reset categories and loaded when cleared', () => {
      const store = setup();
      store.setGroupCategories([mockCategory()]);

      store.clearGroupCategories();

      expect(store.groupCategories()).toEqual([]);
      expect(store.loaded()).toBe(false);
    });
  });
});
