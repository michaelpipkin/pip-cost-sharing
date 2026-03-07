import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { DeleteDialogComponent } from './delete-dialog.component';

describe('DeleteDialogComponent', () => {
  let fixture: ComponentFixture<DeleteDialogComponent>;
  let el: HTMLElement;

  const dialogData = { operation: 'Delete', target: 'Food' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeleteDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteDialogComponent);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the operation in the title', () => {
      expect(query('delete-dialog-title')?.textContent?.trim()).toBe(
        'Confirm Delete'
      );
    });

    it('should display warning text with operation and target', () => {
      const warningText = query('delete-warning-text')?.textContent?.trim();
      expect(warningText).toContain('delete');
      expect(warningText).toContain('Food');
    });

    it('should display the confirm button with operation label', () => {
      expect(query('delete-confirm-button')?.textContent?.trim()).toBe('Delete');
    });

    it('should display the cancel button', () => {
      expect(query('delete-cancel-button')?.textContent?.trim()).toBe('Cancel');
    });
  });

  describe('button dialog close values', () => {
    it('confirm button should have mat-dialog-close set to true', () => {
      const confirmBtnDe = fixture.debugElement.query(By.css('[data-testid="delete-confirm-button"]'));
      const closeDir = confirmBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('cancel button should have mat-dialog-close set to false', () => {
      const cancelBtnDe = fixture.debugElement.query(By.css('[data-testid="delete-cancel-button"]'));
      const closeDir = cancelBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(false);
    });
  });

  describe('signals', () => {
    it('should initialize operation signal from dialog data', () => {
      expect(fixture.componentInstance.operation()).toBe('Delete');
    });

    it('should initialize target signal from dialog data', () => {
      expect(fixture.componentInstance.target()).toBe('Food');
    });
  });
});
