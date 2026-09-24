import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { SortingService } from '@services/sorting.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import {
  createMockAnalyticsService,
  createMockCategoryStore,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSortingService,
  mockCategory,
  mockGroup,
  mockMember,
} from '@testing/test-helpers';
import { GuidedTourConfig } from '@models/guided-tour';
import { GuidedTourService } from '@services/guided-tour.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesComponent } from './categories.component';

describe('CategoriesComponent', () => {
  let fixture: ComponentFixture<CategoriesComponent>;
  let component: CategoriesComponent;
  let el: HTMLElement;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;

  beforeEach(async () => {
    mockCategoryStore = createMockCategoryStore();
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockDialog = createMockMatDialog();

    mockGroupStore.currentGroup.set(mockGroup({ name: 'Test Group' }));
    mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));
    mockCategoryStore.groupCategories.set([
      mockCategory({ id: 'cat-1', name: 'Food', active: true }),
      mockCategory({ id: 'cat-2', name: 'Transport', active: true }),
      mockCategory({ id: 'cat-3', name: 'Old Category', active: false }),
    ]);

    await TestBed.configureTestingModule({
      imports: [CategoriesComponent],
      providers: [
        provideRouter([]),
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: SortingService, useValue: createMockSortingService() },
        { provide: MatDialog, useValue: mockDialog },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoriesComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('loading state', () => {
    it('should show loading message when categories are not loaded', async () => {
      mockCategoryStore.loaded.set(false);
      await fixture.whenStable();

      expect(query('loading-categories-message')?.textContent?.trim()).toBe(
        'Loading categories...'
      );
      expect(query('categories-main-container')).toBeFalsy();
    });

    it('should show main content when categories are loaded', () => {
      expect(query('categories-main-container')).toBeTruthy();
      expect(query('loading-categories-message')).toBeFalsy();
    });
  });

  describe('initial render', () => {
    it('should render page title', () => {
      expect(query('categories-page-title')?.textContent?.trim()).toBe(
        'Categories'
      );
    });

    it('should display current group name', () => {
      expect(query('current-group-name')?.textContent?.trim()).toBe(
        'Test Group'
      );
    });

    it('should render search input', () => {
      expect(query('category-search-input')).toBeTruthy();
    });

    it('should render active-only toggle', () => {
      expect(query('active-categories-only-toggle')).toBeTruthy();
    });

    it('should render help button', () => {
      expect(query('categories-help-button')).toBeTruthy();
    });
  });

  describe('categories table', () => {
    it('should display categories table when categories exist', () => {
      expect(query('categories-table')).toBeTruthy();
    });

    it('should show only active categories by default', () => {
      const rows = el.querySelectorAll('[data-testid^="category-row-"]');
      expect(rows.length).toBe(2);
    });

    it('should show all categories when activeOnly is false', async () => {
      component.activeOnly.set(false);
      await fixture.whenStable();

      const rows = el.querySelectorAll('[data-testid^="category-row-"]');
      expect(rows.length).toBe(3);
    });

    it('should show "No categories found" when no categories match', async () => {
      component.nameFilter.set('zzzzz');
      await fixture.whenStable();

      expect(query('no-categories-message')?.textContent?.trim()).toBe(
        'No categories found'
      );
    });

    it('should filter categories by name', async () => {
      component.nameFilter.set('food');
      await fixture.whenStable();

      const rows = el.querySelectorAll('[data-testid^="category-row-"]');
      expect(rows.length).toBe(1);
    });
  });

  describe('admin controls', () => {
    it('should show Add Category button for group admin', () => {
      const btn = query('add-category-button');
      expect(btn).toBeTruthy();
      expect(btn?.classList.contains('hidden')).toBe(false);
    });

    it('should hide Add Category button for non-admin', async () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      await fixture.whenStable();

      const btn = query('add-category-button');
      expect(btn).toBeTruthy();
      expect(btn?.classList.contains('hidden')).toBe(true);
    });
  });

  describe('methods', () => {
    it('should open add dialog', () => {
      component.addCategory();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open edit dialog on row click for admin', () => {
      component.onRowClick(mockCategory());
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should not open edit dialog on row click for non-admin', () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      component.onRowClick(mockCategory());
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should open help dialog on showHelp', () => {
      component.showHelp();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should update sort signals on sortCategories', () => {
      component.sortCategories({ active: 'name', direction: 'desc' });
      expect(component.sortField()).toBe('name');
      expect(component.sortAsc()).toBe(false);
    });
  });
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();
    const step = (id: string) => tourConfig.steps.find((s) => s.id === id)!;

    it('should start the categories tour from the help icon', () => {
      query('categories-help-button')!.click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('categories');
    });

    it('should add sample categories when the group has only one', async () => {
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'default', name: 'Default', active: true }),
      ]);
      await render();
      expect(query('no-categories-placeholder')).toBeTruthy();

      component.startTour();
      await render();

      expect(component.categories().length).toBeGreaterThan(1);
      expect(component.categories()[0]!.name).toBe('Default');
      expect(query('no-categories-placeholder')).toBeNull();
      expect(query('category-filters')).toBeTruthy();
      expect(step('intro').text).toContain('samples');
    });

    it('should use the real categories when there are several', () => {
      component.startTour();

      expect(component.categories().map((c) => c.name)).toEqual([
        'Food',
        'Transport',
        'Old Category',
      ]);
      expect(step('intro').text).not.toContain('samples');
    });

    it('should show inactive categories for the filters step and restore after', async () => {
      component.startTour();
      await runStep('filters');
      expect(component.activeOnly()).toBe(false);

      tourConfig.onEnd!('closed');
      expect(component.activeOnly()).toBe(true);
    });

    it('should open Add and Edit Category for admins and close them on end', async () => {
      component.startTour();

      await runStep('add-category-name');
      await runStep('edit-category');
      await runStep('delete-category');

      expect(mockDialog.open).toHaveBeenCalledTimes(2);
      const [, editConfig] = mockDialog.open.mock.calls[1] as unknown as [
        unknown,
        { autoFocus: boolean; data: { category: { name: string } } },
      ];
      expect(editConfig.autoFocus).toBe(false);
      expect(editConfig.data.category.name).toBe('Food');

      const editRef = mockDialog.open.mock.results[1]!.value;
      tourConfig.onEnd!('closed');
      expect(editRef.close).toHaveBeenCalled();
    });

    it('should skip the add and edit steps for non-admins', () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      component.startTour();

      for (const id of [
        'add-category',
        'add-category-name',
        'edit-category',
        'delete-category',
      ]) {
        expect(step(id).when!(), id).toBe(false);
      }
    });

    it('should clear the sample when the tour ends', async () => {
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'default', name: 'Default', active: true }),
      ]);
      component.startTour();
      tourConfig.onEnd!('closed');
      await render();

      expect(component.categories()).toHaveLength(1);
      expect(query('no-categories-placeholder')).toBeTruthy();
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
