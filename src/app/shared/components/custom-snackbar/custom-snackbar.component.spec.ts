import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  MAT_SNACK_BAR_DATA,
  MatSnackBarRef,
} from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from './custom-snackbar.component';

describe('CustomSnackbarComponent', () => {
  let fixture: ComponentFixture<CustomSnackbarComponent>;
  let component: CustomSnackbarComponent;
  let el: HTMLElement;
  let mockSnackBarRef: { dismiss: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockSnackBarRef = { dismiss: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CustomSnackbarComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_SNACK_BAR_DATA, useValue: { message: 'Test message' } },
        { provide: MatSnackBarRef, useValue: mockSnackBarRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomSnackbarComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  describe('rendering', () => {
    it('should display the provided message', () => {
      const messageSpan = el.querySelector('.snackbar-content span');
      expect(messageSpan?.textContent?.trim()).toBe('Test message');
    });

    it('should render a close button', () => {
      const closeBtn = el.querySelector('.close-button');
      expect(closeBtn).toBeTruthy();
    });

    it('should render a progress spinner', () => {
      const spinner = el.querySelector('mat-progress-spinner');
      expect(spinner).toBeTruthy();
    });
  });

  describe('dismiss', () => {
    it('should call snackbarRef.dismiss() when close button is clicked', async () => {
      const closeBtn = el.querySelector('.close-button') as HTMLElement;
      closeBtn.click();
      await fixture.whenStable();
      expect(mockSnackBarRef.dismiss).toHaveBeenCalled();
    });
  });

  describe('progress', () => {
    it('should start with progress at 100', () => {
      expect(component.progress()).toBe(100);
    });
  });
});
