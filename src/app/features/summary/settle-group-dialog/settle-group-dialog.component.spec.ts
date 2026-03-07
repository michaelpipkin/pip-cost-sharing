import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SettleGroupDialogComponent } from './settle-group-dialog.component';
import { AnalyticsService } from '@services/analytics.service';
import { AmountDue } from '@models/amount-due';
import {
  createMockSnackBar,
  createMockAnalyticsService,
  mockMember,
  mockDocRef,
} from '@testing/test-helpers';

describe('SettleGroupDialogComponent', () => {
  let fixture: ComponentFixture<SettleGroupDialogComponent>;
  let component: SettleGroupDialogComponent;
  let el: HTMLElement;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;

  const memberAlice = mockMember({
    id: 'member-alice',
    displayName: 'Alice',
    ref: mockDocRef('groups/group-1/members/member-alice'),
  });
  const memberBob = mockMember({
    id: 'member-bob',
    displayName: 'Bob',
    ref: mockDocRef('groups/group-1/members/member-bob'),
  });

  const transfers: AmountDue[] = [
    new AmountDue({
      owedByMemberRef: memberAlice.ref,
      owedByMember: memberAlice,
      owedToMemberRef: memberBob.ref,
      owedToMember: memberBob,
      amount: 25.0,
    }),
  ];

  const dialogData = {
    transfers,
    settlementText: 'Alice pays Bob $25.00',
  };

  beforeEach(async () => {
    mockSnackBar = createMockSnackBar();

    // Ensure navigator.clipboard is defined (may be absent in the test environment)
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true,
      });
    }

    await TestBed.configureTestingModule({
      imports: [SettleGroupDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettleGroupDialogComponent);
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
      expect(query('settle-group-dialog-title')?.textContent?.trim()).toBe(
        'Settle Group'
      );
    });

    it('should display warning message', () => {
      expect(query('settle-group-warning')).toBeTruthy();
    });

    it('should display transfers list', () => {
      expect(query('settle-group-transfers-list')).toBeTruthy();
    });

    it('should render each transfer in the list', () => {
      const listItems = el.querySelectorAll(
        '[data-testid="settle-group-transfers-list"] li'
      );
      expect(listItems.length).toBe(1);
      expect(listItems[0]!.textContent).toContain('Alice');
      expect(listItems[0]!.textContent).toContain('Bob');
    });
  });

  describe('actions', () => {
    it('confirm button should have mat-dialog-close set to true', () => {
      const confirmBtnDe = fixture.debugElement.query(
        By.css('[data-testid="confirm-settle-button"]')
      );
      const closeDir = confirmBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('cancel button should have mat-dialog-close set to false', () => {
      const cancelBtnDe = fixture.debugElement.query(
        By.css('[data-testid="cancel-settle-button"]')
      );
      const closeDir = cancelBtnDe.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(false);
    });

    it('should copy settlement text to clipboard and show snackbar on success', async () => {
      const clipboardSpy = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue(undefined);

      await component.copyToClipboard();

      expect(clipboardSpy).toHaveBeenCalledWith('Alice pays Bob $25.00');
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should show error snackbar when clipboard write fails', async () => {
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
        new Error('Clipboard unavailable')
      );

      await component.copyToClipboard();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });
});
