import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { createMockDialogRef } from '@testing/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddExpenseOptionsDialogComponent } from './add-expense-options-dialog.component';

describe('AddExpenseOptionsDialogComponent', () => {
  let fixture: ComponentFixture<AddExpenseOptionsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddExpenseOptionsDialogComponent],
      providers: [{ provide: MatDialogRef, useValue: createMockDialogRef() }],
    }).compileComponents();

    fixture = TestBed.createComponent(AddExpenseOptionsDialogComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('offers all three options enabled', () => {
    const manualButton = fixture.debugElement.query(
      By.css('[data-testid="manual-expense-button"]')
    );
    const receiptButton = fixture.debugElement.query(
      By.css('[data-testid="receipt-expense-button"]')
    );
    const rentalButton = fixture.debugElement.query(
      By.css('[data-testid="rental-expense-button"]')
    );
    expect(manualButton.nativeElement.disabled).toBe(false);
    expect(receiptButton.nativeElement.disabled).toBe(false);
    expect(rentalButton.nativeElement.disabled).toBe(false);
  });
});
