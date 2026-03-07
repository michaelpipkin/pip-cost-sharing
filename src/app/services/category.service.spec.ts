import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import * as firestoreModule from 'firebase/firestore';
import { CategoryService } from './category.service';
import { CategoryStore } from '@store/category.store';
import { AnalyticsService } from '@services/analytics.service';
import { SortingService } from './sorting.service';

const mockFs = {};
const mockCollection = {};
const mockQuery = {};

function makeSnap(size: number) {
  return {
    size,
    empty: size === 0,
    docs: Array.from({ length: size }, (_, i) => ({
      id: `doc-${i}`,
      data: () => ({}),
    })),
  };
}

describe('CategoryService', () => {
  let service: CategoryService;
  const mockCategoryStore = {
    setGroupCategories: vi.fn(),
    groupCategories: signal<any[]>([]),
  };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(firestoreModule, 'collection').mockReturnValue(
      mockCollection as any
    );
    vi.spyOn(firestoreModule, 'query').mockReturnValue(mockQuery as any);
    vi.spyOn(firestoreModule, 'where').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'orderBy').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'documentId').mockReturnValue({} as any);
    vi.spyOn(firestoreModule, 'onSnapshot').mockReturnValue(vi.fn() as any);
    vi.spyOn(firestoreModule, 'getDocs').mockResolvedValue(makeSnap(0) as any);
    vi.spyOn(firestoreModule, 'addDoc').mockResolvedValue({
      id: 'new-doc',
    } as any);
    vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValue(undefined);
    vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        CategoryService,
        { provide: firestoreModule.getFirestore, useValue: mockFs },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: SortingService, useValue: new SortingService() },
      ],
    });
    service = TestBed.inject(CategoryService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addCategory', () => {
    it('should throw when a category with the same name already exists', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(
        service.addCategory('group-1', { name: 'Groceries' })
      ).rejects.toThrow('This category already exists.');
    });

    it('should call addDoc when the category name is unique', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(0) as any
      );
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce({
        id: 'new-cat',
      } as any);

      await service.addCategory('group-1', { name: 'Groceries' });

      expect(firestoreModule.addDoc).toHaveBeenCalledOnce();
    });

    it('should return the new document reference', async () => {
      const mockRef = { id: 'new-cat' };
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(0) as any
      );
      vi.spyOn(firestoreModule, 'addDoc').mockResolvedValueOnce(mockRef as any);

      const result = await service.addCategory('group-1', {
        name: 'Groceries',
      });

      expect(result).toBe(mockRef);
    });

    it('should not call addDoc when name is duplicate', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(
        service.addCategory('group-1', { name: 'Groceries' })
      ).rejects.toThrow();
      expect(firestoreModule.addDoc).not.toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    const mockCategoryRef = {
      id: 'cat-1',
      parent: { id: 'categories' },
    } as any;

    it('should throw when another category with the same name exists', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(
        service.updateCategory(mockCategoryRef, { name: 'Groceries' })
      ).rejects.toThrow('This category already exists.');
    });

    it('should call updateDoc when the name is unique', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(0) as any
      );
      vi.spyOn(firestoreModule, 'updateDoc').mockResolvedValueOnce(undefined);

      await service.updateCategory(mockCategoryRef, { name: 'New Name' });

      expect(firestoreModule.updateDoc).toHaveBeenCalledWith(mockCategoryRef, {
        name: 'New Name',
      });
    });

    it('should not call updateDoc when name is duplicate', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(
        service.updateCategory(mockCategoryRef, { name: 'Groceries' })
      ).rejects.toThrow();
      expect(firestoreModule.updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    const mockCategoryRef = {
      id: 'cat-1',
      parent: { parent: { id: 'group-1' } },
    } as any;

    it('should throw when group ID cannot be determined', async () => {
      const badRef = { id: 'cat-1', parent: { parent: null } } as any;
      await expect(service.deleteCategory(badRef)).rejects.toThrow(
        'Invalid category reference - cannot determine group ID.'
      );
    });

    it('should throw when category is assigned to expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(service.deleteCategory(mockCategoryRef)).rejects.toThrow(
        'This category is assigned to expenses and cannot be deleted.'
      );
    });

    it('should call deleteDoc when no expenses reference this category', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(0) as any
      );
      vi.spyOn(firestoreModule, 'deleteDoc').mockResolvedValueOnce(undefined);

      await service.deleteCategory(mockCategoryRef);

      expect(firestoreModule.deleteDoc).toHaveBeenCalledWith(mockCategoryRef);
    });

    it('should not call deleteDoc when category is assigned to expenses', async () => {
      vi.spyOn(firestoreModule, 'getDocs').mockResolvedValueOnce(
        makeSnap(1) as any
      );

      await expect(service.deleteCategory(mockCategoryRef)).rejects.toThrow();
      expect(firestoreModule.deleteDoc).not.toHaveBeenCalled();
    });
  });
});
