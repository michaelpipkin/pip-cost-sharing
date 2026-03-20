import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { LoadingService } from '@components/loading/loading.service';
import { UserService } from '@services/user.service';
import {
  createMockDialogRef,
  createMockLoadingService,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptDialogComponent } from './receipt-dialog.component';

describe('ReceiptDialogComponent', () => {
  let fixture: ComponentFixture<ReceiptDialogComponent>;
  let component: ReceiptDialogComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockUserService: { updateUser: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockUserService = { updateUser: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [ReceiptDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: UserService, useValue: mockUserService },
        { provide: LoadingService, useValue: createMockLoadingService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptDialogComponent);
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
      expect(query('dialog-title')?.textContent?.trim()).toContain(
        'Receipt Retention Policy'
      );
    });

    it('should display policy content', () => {
      expect(query('dialog-text-1')).toBeTruthy();
    });

    it('should render the acknowledge checkbox', () => {
      expect(query('acknowledge-checkbox')).toBeTruthy();
    });

    it('should have confirm button disabled when not acknowledged', () => {
      const confirmBtn = query('confirm-button') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });
  });

  describe('acknowledgePolicy', () => {
    it('should enable confirm button when acknowledged', async () => {
      component.acknowledged.set(true);
      await fixture.whenStable();

      const confirmBtn = query('confirm-button') as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(false);
    });

    it('should call userService.updateUser with receipt policy', async () => {
      component.acknowledged.set(true);
      await fixture.whenStable();

      await component.acknowledgePolicy();

      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        receiptPolicy: true,
      });
    });

    it('should close the dialog with true after acknowledging', async () => {
      component.acknowledged.set(true);
      await fixture.whenStable();

      await component.acknowledgePolicy();

      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });
  });
});
