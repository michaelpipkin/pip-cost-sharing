import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { MailDocument } from '@models/mail';
import { AdminMailService } from '@services/admin-mail.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
} from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  let mockMailService: { getMailDocuments: ReturnType<typeof vi.fn> };
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
    mockMailService = { getMailDocuments: vi.fn().mockResolvedValue([]) };

    await TestBed.configureTestingModule({
      imports: [AdminEmailLogComponent],
      providers: [
        { provide: AdminMailService, useValue: mockMailService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
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
      expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ action: 'load_mail_documents' })
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

  describe('onRowClick()', () => {
    it('should expand the clicked row', async () => {
      await createComponent();
      const doc = mockMailDoc();
      component.onRowClick(doc);
      expect(component.expandedRow()).toBe(doc);
    });

    it('should collapse a row when the same row is clicked again', async () => {
      await createComponent();
      const doc = mockMailDoc();
      component.onRowClick(doc);
      component.onRowClick(doc);
      expect(component.expandedRow()).toBeNull();
    });

    it('should switch to newly clicked row when a different row is clicked', async () => {
      await createComponent();
      const doc1 = mockMailDoc({ id: 'mail-1' });
      const doc2 = mockMailDoc({ id: 'mail-2' });
      component.onRowClick(doc1);
      component.onRowClick(doc2);
      expect(component.expandedRow()).toBe(doc2);
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
