import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppCheckErrorDialogComponent } from './app-check-error-dialog.component';

describe('AppCheckErrorDialogComponent', () => {
  let fixture: ComponentFixture<AppCheckErrorDialogComponent>;
  let el: HTMLElement;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockRouter: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialogRef = { close: vi.fn() };
    mockRouter = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AppCheckErrorDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppCheckErrorDialogComponent);
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
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the dialog title', () => {
    expect(query('app-check-error-dialog-title')?.textContent?.trim()).toBe(
      "Can't Verify Your Device"
    );
  });

  it('should not reference a report form that only exists on the Help page', () => {
    expect(
      query('app-check-error-dialog-content')?.textContent
    ).not.toContain('below');
  });

  it('should close the dialog and navigate to Help when "Get Help" is clicked', () => {
    query('app-check-error-dialog-help-button')?.dispatchEvent(
      new Event('click')
    );

    expect(mockDialogRef.close).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/help');
  });
});
