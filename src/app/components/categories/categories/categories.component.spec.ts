import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CategoriesComponent } from './categories.component';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SortingService } from '@services/sorting.service';
import { DemoService } from '@services/demo.service';
import { TourService } from '@services/tour.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockCategoryStore,
  createMockGroupStore,
  createMockMemberStore,
  createMockSortingService,
  createMockLoadingService,
  createMockDemoService,
  createMockTourService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
  mockMember,
  mockCategory,
} from '@testing/test-helpers';

describe('CategoriesComponent', () => {
  let fixture: ComponentFixture<CategoriesComponent>;
  let component: CategoriesComponent;
  let el: HTMLElement;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;

  beforeEach(async () => {
    mockCategoryStore = createMockCategoryStore();
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockDemoService = createMockDemoService();
    mockTourService = createMockTourService();
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
        provideNoopAnimations(),
        provideRouter([]),
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: SortingService, useValue: createMockSortingService() },
        { provide: MatDialog, useValue: mockDialog },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: DemoService, useValue: mockDemoService },
        { provide: TourService, useValue: mockTourService },
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

    it('should not show tour button when not in demo mode', () => {
      expect(query('categories-tour-button')).toBeFalsy();
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

  describe('demo mode', () => {
    it('should block addCategory and show restriction message', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.addCategory();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should block onRowClick and show restriction message', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.onRowClick(mockCategory());

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('methods', () => {
    it('should open add dialog when not in demo mode', () => {
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

    it('should delegate startTour to tourService', () => {
      component.startTour();
      expect(mockTourService.startCategoriesTour).toHaveBeenCalledWith(true);
    });

    it('should update sort signals on sortCategories', () => {
      component.sortCategories({ active: 'name', direction: 'desc' });
      expect(component.sortField()).toBe('name');
      expect(component.sortAsc()).toBe(false);
    });
  });
});
