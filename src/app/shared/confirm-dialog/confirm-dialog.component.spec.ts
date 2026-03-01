import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let el: HTMLElement;

  const dialogData = {
    dialogTitle: 'Confirm Action',
    confirmationText: 'Are you sure you want to do this?',
    cancelButtonText: 'Cancel',
    confirmButtonText: 'Confirm',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
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
    it('should display the dialog title', () => {
      expect(query('dialog-title')?.textContent?.trim()).toBe('Confirm Action');
    });

    it('should display the confirmation text', () => {
      expect(query('confirmation-text')?.textContent?.trim()).toBe(
        'Are you sure you want to do this?'
      );
    });

    it('should display the confirm button with correct label', () => {
      expect(query('confirm-button')?.textContent?.trim()).toBe('Confirm');
    });

    it('should display the cancel button with correct label', () => {
      expect(query('cancel-button')?.textContent?.trim()).toBe('Cancel');
    });
  });

  describe('button dialog close values', () => {
    it('confirm button should have mat-dialog-close set to true', () => {
      const confirmBtnDe = fixture.debugElement.query(By.css('[data-testid="confirm-button"]'));
      const closeDir = confirmBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('cancel button should have mat-dialog-close set to false', () => {
      const cancelBtnDe = fixture.debugElement.query(By.css('[data-testid="cancel-button"]'));
      const closeDir = cancelBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(false);
    });
  });
});
