import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { AppError } from '@models/app-error';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorDetailDialogComponent } from './error-detail-dialog.component';

function mockError(overrides: Partial<AppError> = {}): AppError {
  return {
    id: 'err-1',
    component: 'ExpenseService',
    action: 'saveExpense',
    message: 'Failed to save',
    error: 'permission-denied',
    additionalInfo: 'group g1',
    timestamp: { toDate: () => new Date(2024, 0, 15, 14, 5) } as any,
    ...overrides,
  };
}

describe('ErrorDetailDialogComponent', () => {
  let fixture: ComponentFixture<ErrorDetailDialogComponent>;
  let component: ErrorDetailDialogComponent;
  let el: HTMLElement;

  async function createComponent(
    data: AppError | (AppError & { count: number })
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ErrorDetailDialogComponent],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: data }],
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorDetailDialogComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  describe('isGrouped()', () => {
    it('should be false for a single error', async () => {
      await createComponent(mockError());
      expect(component.isGrouped()).toBe(false);
    });

    it('should be true when the row carries a count', async () => {
      await createComponent({ ...mockError(), count: 3 });
      expect(component.isGrouped()).toBe(true);
    });
  });

  describe('single error', () => {
    it('should show the component, action, message, error, additional info and formatted date', async () => {
      await createComponent(mockError());
      const text = el.textContent ?? '';
      expect(text).toContain('ExpenseService');
      expect(text).toContain('saveExpense');
      expect(text).toContain('Failed to save');
      expect(text).toContain('permission-denied');
      expect(text).toContain('group g1');
      expect(text).toMatch(/01\/15\/24 2:05\sPM/);
      expect(text).not.toContain('Count');
    });

    it('should omit the error and additional info rows when they are absent', async () => {
      await createComponent(
        mockError({ error: undefined, additionalInfo: undefined })
      );
      const labels = [...el.querySelectorAll('dt')].map((dt) =>
        dt.textContent?.trim()
      );
      expect(labels).toEqual([
        'Component',
        'Action',
        'Message',
        'Date / Time',
      ]);
    });
  });

  describe('grouped error', () => {
    it('should show the count and hide the error, additional info and date', async () => {
      await createComponent({ ...mockError(), count: 7 });
      const labels = [...el.querySelectorAll('dt')].map((dt) =>
        dt.textContent?.trim()
      );
      expect(labels).toEqual(['Component', 'Action', 'Message', 'Count']);
      const dds = [...el.querySelectorAll('dd')].map((dd) =>
        dd.textContent?.trim()
      );
      expect(dds[3]).toBe('7');
      expect(el.textContent).not.toContain('permission-denied');
      expect(el.textContent).not.toContain('group g1');
    });
  });

  describe('buttons', () => {
    it('should close with true from the Delete button', async () => {
      await createComponent(mockError());
      const deleteBtn = fixture.debugElement.query(
        By.css('[data-testid="error-detail-delete-button"]')
      );
      const closeDir = deleteBtn.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('should not close with true from the Close button', async () => {
      await createComponent(mockError());
      const closeBtn = fixture.debugElement.query(
        By.css('[data-testid="error-detail-close-button"]')
      );
      const closeDir = closeBtn.injector.get(MatDialogClose, null);
      expect(closeDir).not.toBeNull();
      expect(closeDir?.dialogResult).toBeFalsy();
    });
  });
});
