import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { MailDocument } from '@models/mail';
import { AdminMailService } from '@services/admin-mail.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockMatDialog,
} from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailDetailDialogComponent } from './email-detail-dialog.component';
import { AdminEmailLogComponent } from './email-log.component';

function mockMailDoc(overrides: Partial<MailDocument> = {}): MailDocument {
  return {
    id: 'mail-1',
    to: 'user@example.com',
    message: { subject: 'Test Subject' },
    delivery: {
      state: 'SUCCESS',
      attempts: 1,
      startTime: { toDate: () => new Date('2024-01-15T10:00:00') } as any,
    },
    ...overrides,
  };
}

describe('AdminEmailLogComponent', () => {
  let fixture: ComponentFixture<AdminEmailLogComponent>;
  let component: AdminEmailLogComponent;
  let mockMailService: {
    getMailDocuments: ReturnType<typeof vi.fn>;
    deleteMailDocument: ReturnType<typeof vi.fn>;
    deleteMailDocuments: ReturnType<typeof vi.fn>;
  };
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackBar: { openFromComponent: ReturnType<typeof vi.fn> };

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  async function createComponent(): Promise<void> {
    mockLoadingService = createMockLoadingService();
    mockAnalyticsService = createMockAnalyticsService();
    mockSnackBar = { openFromComponent: vi.fn() };
    mockMailService = {
      getMailDocuments: vi.fn().mockResolvedValue([]),
      deleteMailDocument: vi.fn().mockResolvedValue(undefined),
      deleteMailDocuments: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AdminEmailLogComponent],
      providers: [
        { provide: AdminMailService, useValue: mockMailService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        { provide: MatDialog, useValue: createMockMatDialog() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminEmailLogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  describe('columnsToDisplay', () => {
    it('should always start with the select column', async () => {
      await createComponent();
      expect(component.columnsToDisplay()[0]).toBe('select');
    });

    it('should include subject column on desktop', async () => {
      await createComponent();
      component.isMobile.set(false);
      expect(component.columnsToDisplay()).toContain('subject');
    });

    it('should exclude subject column on mobile', async () => {
      await createComponent();
      component.isMobile.set(true);
      expect(component.columnsToDisplay()).not.toContain('subject');
    });

    it('should always include base columns regardless of breakpoint', async () => {
      await createComponent();
      const base = ['dateTime', 'recipient', 'state', 'attempts', 'error'];
      component.isMobile.set(true);
      const mobileCols = component.columnsToDisplay();
      base.forEach((col) => expect(mobileCols).toContain(col));

      component.isMobile.set(false);
      const desktopCols = component.columnsToDisplay();
      base.forEach((col) => expect(desktopCols).toContain(col));
    });
  });

  describe('filteredDocuments', () => {
    it('should return all documents when filter is ALL', async () => {
      await createComponent();
      const docs = [
        mockMailDoc({
          id: 'mail-1',
          delivery: {
            state: 'SUCCESS',
            attempts: 1,
            startTime: { toDate: () => new Date() } as any,
          },
        }),
        mockMailDoc({
          id: 'mail-2',
          delivery: {
            state: 'ERROR',
            attempts: 3,
            startTime: { toDate: () => new Date() } as any,
          },
        }),
      ];
      component.mailDocuments.set(docs);
      component.selectedState.set('ALL');
      expect(component.filteredDocuments().length).toBe(2);
    });

    it('should filter to only matching state', async () => {
      await createComponent();
      const docs = [
        mockMailDoc({
          id: 'mail-1',
          delivery: {
            state: 'SUCCESS',
            attempts: 1,
            startTime: { toDate: () => new Date() } as any,
          },
        }),
        mockMailDoc({
          id: 'mail-2',
          delivery: {
            state: 'ERROR',
            attempts: 3,
            startTime: { toDate: () => new Date() } as any,
          },
        }),
      ];
      component.mailDocuments.set(docs);
      component.selectedState.set('SUCCESS');
      const result = component.filteredDocuments();
      expect(result.length).toBe(1);
      expect(result[0]?.delivery?.state).toBe('SUCCESS');
    });

    it('should return empty array when no documents match selected state', async () => {
      await createComponent();
      component.mailDocuments.set([
        mockMailDoc({
          delivery: {
            state: 'SUCCESS',
            attempts: 1,
            startTime: { toDate: () => new Date() } as any,
          },
        }),
      ]);
      component.selectedState.set('ERROR');
      expect(component.filteredDocuments().length).toBe(0);
    });

    it('should clear the current selection when the state filter changes', async () => {
      await createComponent();
      const doc = mockMailDoc();
      component.mailDocuments.set([doc]);
      component.toggleRow(doc);
      expect(component.hasSelection()).toBe(true);
      component.selectedState.set('ERROR');
      TestBed.flushEffects();
      expect(component.hasSelection()).toBe(false);
    });
  });

  describe('loadMailDocuments()', () => {
    it('should call loadingOn and loadingOff', async () => {
      await createComponent();
      mockLoadingService.loadingOn.mockClear();
      mockLoadingService.loadingOff.mockClear();
      await component.loadMailDocuments();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('should set mailDocuments on success', async () => {
      await createComponent();
      const docs = [mockMailDoc()];
      mockMailService.getMailDocuments.mockResolvedValue(docs);
      await component.loadMailDocuments();
      expect(component.mailDocuments()).toEqual(docs);
    });

    it('should clear the current selection', async () => {
      await createComponent();
      const doc = mockMailDoc();
      mockMailService.getMailDocuments.mockResolvedValue([doc]);
      await component.loadMailDocuments();
      component.toggleRow(doc);
      expect(component.hasSelection()).toBe(true);
      await component.loadMailDocuments();
      expect(component.hasSelection()).toBe(false);
    });

    it('should clear error signal before loading', async () => {
      await createComponent();
      component.error.set('previous error');
      await component.loadMailDocuments();
      expect(component.error()).toBeNull();
    });

    it('should set error signal on failure', async () => {
      await createComponent();
      mockMailService.getMailDocuments.mockRejectedValue(
        new Error('Network error')
      );
      await component.loadMailDocuments();
      expect(component.error()).toBe('Network error');
    });

    it('should show snackbar on failure', async () => {
      await createComponent();
      mockMailService.getMailDocuments.mockRejectedValue(
        new Error('Network error')
      );
      await component.loadMailDocuments();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should log analytics error on failure', async () => {
      await createComponent();
      mockMailService.getMailDocuments.mockRejectedValue(
        new Error('Network error')
      );
      await component.loadMailDocuments();
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Admin Email Log Component',
        'load_mail_documents',
        'Failed to load mail documents',
        expect.any(String)
      );
    });
  });

  describe('chipTextColor()', () => {
    it('should return on-primary for SUCCESS', async () => {
      await createComponent();
      expect(component.chipTextColor('SUCCESS')).toBe('var(--on-primary)');
    });

    it('should return on-error for ERROR', async () => {
      await createComponent();
      expect(component.chipTextColor('ERROR')).toBe('var(--on-error)');
    });

    it('should return on-tertiary for RETRY', async () => {
      await createComponent();
      expect(component.chipTextColor('RETRY')).toBe('var(--on-tertiary)');
    });

    it('should return on-surface for ALL, PENDING, and PROCESSING', async () => {
      await createComponent();
      expect(component.chipTextColor('ALL')).toBe('var(--on-surface)');
      expect(component.chipTextColor('PENDING')).toBe('var(--on-surface)');
      expect(component.chipTextColor('PROCESSING')).toBe('var(--on-surface)');
    });
  });

  describe('selection', () => {
    it('should mark a row selected after toggleRow and unselected after toggling again', async () => {
      await createComponent();
      const doc = mockMailDoc();
      component.mailDocuments.set([doc]);
      expect(component.isRowSelected(doc)).toBe(false);
      component.toggleRow(doc);
      expect(component.isRowSelected(doc)).toBe(true);
      component.toggleRow(doc);
      expect(component.isRowSelected(doc)).toBe(false);
    });

    it('hasSelection should reflect whether any row is selected', async () => {
      await createComponent();
      const doc = mockMailDoc();
      component.mailDocuments.set([doc]);
      expect(component.hasSelection()).toBe(false);
      component.toggleRow(doc);
      expect(component.hasSelection()).toBe(true);
    });

    it('toggleAll should select every visible row when none are selected', async () => {
      await createComponent();
      const docs = [mockMailDoc({ id: 'mail-1' }), mockMailDoc({ id: 'mail-2' })];
      component.mailDocuments.set(docs);
      component.toggleAll();
      expect(component.allSelected()).toBe(true);
      docs.forEach((d) => expect(component.isRowSelected(d)).toBe(true));
    });

    it('toggleAll should clear the selection when all visible rows are already selected', async () => {
      await createComponent();
      const docs = [mockMailDoc({ id: 'mail-1' }), mockMailDoc({ id: 'mail-2' })];
      component.mailDocuments.set(docs);
      component.toggleAll();
      component.toggleAll();
      expect(component.hasSelection()).toBe(false);
    });

    it('someSelected should be true only when some but not all rows are selected', async () => {
      await createComponent();
      const docs = [mockMailDoc({ id: 'mail-1' }), mockMailDoc({ id: 'mail-2' })];
      component.mailDocuments.set(docs);
      component.toggleRow(docs[0]!);
      expect(component.someSelected()).toBe(true);
      component.toggleRow(docs[1]!);
      expect(component.someSelected()).toBe(false);
      expect(component.allSelected()).toBe(true);
    });
  });

  describe('onRowClick()', () => {
    it('should open the email detail dialog for the clicked row', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi
        .spyOn(dialog, 'open')
        .mockReturnValue({ afterClosed: () => ({ subscribe: vi.fn() }) } as any);
      const doc = mockMailDoc();
      component.onRowClick(doc);
      expect(openSpy).toHaveBeenCalledWith(EmailDetailDialogComponent, {
        data: doc,
      });
    });

    it('should not prompt for delete confirmation when the detail dialog is closed without a delete request', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(false) }),
      } as any);
      component.onRowClick(mockMailDoc());
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('should delete the email when the detail dialog requests deletion and the user confirms', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open')
        .mockReturnValueOnce({
          afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(true) }),
        } as any)
        .mockReturnValueOnce({
          afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(true) }),
        } as any);
      const doc = mockMailDoc();
      component.mailDocuments.set([doc]);
      component.onRowClick(doc);
      await fixture.whenStable();
      expect(mockMailService.deleteMailDocument).toHaveBeenCalledWith(doc.id);
      expect(component.mailDocuments()).toEqual([]);
    });
  });

  describe('deleteSelected()', () => {
    it('should delete the selected emails and clear the selection on confirm', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(true) }),
      } as any);
      const docs = [mockMailDoc({ id: 'mail-1' }), mockMailDoc({ id: 'mail-2' })];
      component.mailDocuments.set(docs);
      component.toggleRow(docs[0]!);
      component.deleteSelected();
      await fixture.whenStable();
      expect(mockMailService.deleteMailDocuments).toHaveBeenCalledWith(['mail-1']);
      expect(component.mailDocuments()).toEqual([docs[1]!]);
      expect(component.hasSelection()).toBe(false);
    });

    it('should not delete anything when the user cancels', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(false) }),
      } as any);
      const doc = mockMailDoc();
      component.mailDocuments.set([doc]);
      component.toggleRow(doc);
      component.deleteSelected();
      await fixture.whenStable();
      expect(mockMailService.deleteMailDocuments).not.toHaveBeenCalled();
    });
  });

  describe('clearLog()', () => {
    it('should delete all documents in the current view on confirm', async () => {
      await createComponent();
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(true) }),
      } as any);
      const docs = [mockMailDoc({ id: 'mail-1' }), mockMailDoc({ id: 'mail-2' })];
      component.mailDocuments.set(docs);
      component.clearLog();
      await fixture.whenStable();
      expect(mockMailService.deleteMailDocuments).toHaveBeenCalledWith([
        'mail-1',
        'mail-2',
      ]);
      expect(component.mailDocuments()).toEqual([]);
    });
  });

  describe('formatRecipient()', () => {
    it('should return a single string address unchanged', async () => {
      await createComponent();
      expect(component.formatRecipient('user@example.com')).toBe(
        'user@example.com'
      );
    });

    it('should join an array of addresses with comma-space', async () => {
      await createComponent();
      expect(
        component.formatRecipient(['a@example.com', 'b@example.com'])
      ).toBe('a@example.com, b@example.com');
    });
  });

  describe('truncate()', () => {
    it('should return empty string for undefined input', async () => {
      await createComponent();
      expect(component.truncate(undefined)).toBe('');
    });

    it('should return text unchanged when within the default 60-character limit', async () => {
      await createComponent();
      expect(component.truncate('short text')).toBe('short text');
    });

    it('should truncate and append ellipsis character when over the limit', async () => {
      await createComponent();
      const long = 'a'.repeat(70);
      const result = component.truncate(long);
      expect(result.endsWith('…')).toBe(true);
      expect(result.length).toBe(61); // 60 chars + single ellipsis character
    });

    it('should respect a custom maxLength argument', async () => {
      await createComponent();
      expect(component.truncate('hello world', 5)).toBe('hello…');
    });
  });
});
