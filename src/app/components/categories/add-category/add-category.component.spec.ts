import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AddCategoryComponent } from './add-category.component';
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
} from '@testing/test-helpers';

describe('AddCategoryComponent', () => {
  let fixture: ComponentFixture<AddCategoryComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddCategoryComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: 'group-1' },
        { provide: MatDialogRef, useValue: createMockDialogRef() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: DemoService, useValue: createMockDemoService() },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddCategoryComponent);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render', () => {
    it('should render dialog title', () => {
      expect(query('add-category-title')?.textContent?.trim()).toBe(
        'Add Category'
      );
    });

    it('should render category name input', () => {
      expect(query('category-name-input')).toBeTruthy();
    });

    it('should render Save and Cancel buttons', () => {
      expect(query('add-category-save-button')).toBeTruthy();
      expect(query('add-category-cancel-button')).toBeTruthy();
    });
  });

  describe('form validation with signals form API', () => {
    it('should disable Save when category name is empty', () => {
      const saveBtn = query('add-category-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when category name is filled', async () => {
      const input = query('category-name-input') as HTMLInputElement;
      input.value = 'Food';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const saveBtn = query('add-category-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should render a cancel button', () => {
      const cancelBtn = query('add-category-cancel-button');
      expect(cancelBtn).toBeTruthy();
      expect(cancelBtn?.textContent?.trim()).toBe('Cancel');
    });
  });
});
