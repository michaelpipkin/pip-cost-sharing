import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EditCategoryComponent } from './edit-category.component';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockLoadingService,
  createMockDemoService,
  createMockCategoryService,
  createMockAnalyticsService,
  createMockSnackBar,
  createMockDialogRef,
  createMockMatDialog,
  mockCategory,
} from '@testing/test-helpers';

describe('EditCategoryComponent', () => {
  let fixture: ComponentFixture<EditCategoryComponent>;
  let component: EditCategoryComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockCategoryService: ReturnType<typeof createMockCategoryService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;

  const testCategory = mockCategory({ name: 'Food', active: true });

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockCategoryService = createMockCategoryService();
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();

    vi.mocked(mockCategoryService.updateCategory).mockResolvedValue(undefined as any);
    vi.mocked(mockCategoryService.deleteCategory).mockResolvedValue(undefined as any);

    await TestBed.configureTestingModule({
      imports: [EditCategoryComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { category: testCategory } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditCategoryComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the dialog title', () => {
      expect(query('edit-category-title')?.textContent?.trim()).toBe(
        'Edit Category'
      );
    });

    it('should pre-populate the name input with the category name', () => {
      const nameInput = query('edit-category-name-input') as HTMLInputElement;
      expect(nameInput.value).toBe('Food');
    });

    it('should render Save, Delete, and Cancel buttons', () => {
      expect(query('edit-category-save-button')).toBeTruthy();
      expect(query('delete-category-button')).toBeTruthy();
      expect(query('edit-category-cancel-button')).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('should disable Save when form is pristine', () => {
      const saveBtn = query('edit-category-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when name is changed', async () => {
      const nameInput = query('edit-category-name-input') as HTMLInputElement;
      nameInput.value = 'Groceries';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const saveBtn = query('edit-category-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    it('should disable Save when name is cleared', async () => {
      const nameInput = query('edit-category-name-input') as HTMLInputElement;
      nameInput.value = '';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const saveBtn = query('edit-category-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });
  });

  describe('onSubmit', () => {
    beforeEach(async () => {
      const nameInput = query('edit-category-name-input') as HTMLInputElement;
      nameInput.value = 'Groceries';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    });

    it('should call categoryService.updateCategory on submit', async () => {
      await component.onSubmit();
      expect(mockCategoryService.updateCategory).toHaveBeenCalled();
    });

    it('should close dialog with saved result on success', async () => {
      await component.onSubmit();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
    });

    it('should block submit and show restriction message in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockCategoryService.updateCategory).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('should open a delete confirmation dialog', () => {
      // The component imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.deleteCategory();
      expect(dialogSpy).toHaveBeenCalled();
    });
  });
});
