import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  HelpContentService,
  HelpSection,
} from '@services/help-content.service';
import { HelpService } from '@services/help.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpComponent } from './help.component';

describe('HelpComponent', () => {
  let fixture: ComponentFixture<HelpComponent>;
  let component: HelpComponent;
  let el: HTMLElement;
  let mockHelpService: {
    createIssue: ReturnType<typeof vi.fn>;
    notifyAdminOfIssue: ReturnType<typeof vi.fn>;
  };
  let mockHelpContentService: {
    getAllHelpSections: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;

  const mockSections: HelpSection[] = [
    {
      id: 'groups',
      title: 'Groups',
      content: ['What is a group? A group is a set of people sharing costs.'],
    },
  ];

  beforeEach(async () => {
    mockSnackBar = createMockSnackBar();
    mockLoadingService = createMockLoadingService();
    mockHelpService = {
      createIssue: vi.fn().mockResolvedValue({
        number: 42,
        html_url: 'https://github.com/michaelpipkin/pip-cost-sharing/issues/42',
        title: 'Test Issue',
        body: 'Issue body text',
      }),
      notifyAdminOfIssue: vi.fn().mockResolvedValue(undefined),
    };
    mockHelpContentService = {
      getAllHelpSections: vi.fn().mockReturnValue(mockSections),
    };

    await TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [
        { provide: HelpService, useValue: mockHelpService },
        { provide: HelpContentService, useValue: mockHelpContentService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HelpComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function setInputValue(testId: string, value: string): void {
    const input = el.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load help sections from HelpContentService on init', () => {
    expect(mockHelpContentService.getAllHelpSections).toHaveBeenCalled();
    expect(component.helpSections).toEqual(mockSections);
  });

  describe('issueForm', () => {
    it('should disable submit button when form is empty', () => {
      expect((query('submit-issue-button') as HTMLButtonElement).disabled).toBe(
        true
      );
    });

    it('should enable submit button when title and body are filled', async () => {
      setInputValue('issue-title-input', 'Test Issue');
      setInputValue('issue-body-input', 'Issue body text');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('submit-issue-button') as HTMLButtonElement).disabled).toBe(
        false
      );
    });

    it('should disable submit button when title is missing', async () => {
      setInputValue('issue-body-input', 'Body text');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('submit-issue-button') as HTMLButtonElement).disabled).toBe(
        true
      );
    });

    it('should disable submit button when body is missing', async () => {
      setInputValue('issue-title-input', 'Title');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('submit-issue-button') as HTMLButtonElement).disabled).toBe(
        true
      );
    });

    it('should show email error for invalid format', async () => {
      setInputValue('issue-email-input', 'not-an-email');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('issue-email-error-0')).toBeTruthy();
    });

    it('should not show email error for valid format', async () => {
      setInputValue('issue-email-input', 'user@example.com');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('issue-email-error-0')).toBeNull();
    });
  });

  describe('clearForm', () => {
    it('should reset form values to empty', async () => {
      setInputValue('issue-title-input', 'Title');
      setInputValue('issue-body-input', 'Body');
      await fixture.whenStable();
      component.clearForm();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        (el.querySelector('[data-testid="issue-title-input"]') as HTMLInputElement).value
      ).toBe('');
      expect(
        (el.querySelector('[data-testid="issue-body-input"]') as HTMLTextAreaElement).value
      ).toBe('');
    });

    it('should not show required errors on the now-blank fields after clearing a touched form', async () => {
      setInputValue('issue-title-input', 'Title');
      setInputValue('issue-body-input', 'Body');
      await fixture.whenStable();
      component.clearForm();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('issue-title-error-0')).toBeNull();
      expect(query('issue-body-error-0')).toBeNull();
    });

    it('should enable clear button when form has content and disable after clearing', async () => {
      expect((query('clear-issue-button') as HTMLButtonElement).disabled).toBe(
        true
      );
      setInputValue('issue-title-input', 'Title');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('clear-issue-button') as HTMLButtonElement).disabled).toBe(
        false
      );
      component.clearForm();
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('clear-issue-button') as HTMLButtonElement).disabled).toBe(
        true
      );
    });
  });

  describe('onSubmit', () => {
    beforeEach(async () => {
      setInputValue('issue-title-input', 'Test Issue');
      setInputValue('issue-body-input', 'Issue body text');
      await fixture.whenStable();
    });

    it('should call helpService.createIssue with title and body', async () => {
      await component.onSubmit();
      expect(mockHelpService.createIssue).toHaveBeenCalledWith(
        'Test Issue',
        'Issue body text'
      );
    });

    it('should append email to body when email is provided', async () => {
      setInputValue('issue-email-input', 'user@example.com');
      await fixture.whenStable();
      await component.onSubmit();
      expect(mockHelpService.createIssue).toHaveBeenCalledWith(
        'Test Issue',
        'Issue body text\n\nSubmitted by: user@example.com'
      );
    });

    it('should clear form on success', async () => {
      await component.onSubmit();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        (el.querySelector('[data-testid="issue-title-input"]') as HTMLInputElement).value
      ).toBe('');
    });

    it('should not show required errors after a successful submission clears the form', async () => {
      await component.onSubmit();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('issue-title-error-0')).toBeNull();
      expect(query('issue-body-error-0')).toBeNull();
    });

    it('should show success snackbar on success', async () => {
      await component.onSubmit();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should show error snackbar on failure', async () => {
      mockHelpService.createIssue.mockRejectedValue(new Error('API error'));
      await component.onSubmit();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should notify the admin with the created issue after a successful submission', async () => {
      await component.onSubmit();
      expect(mockHelpService.notifyAdminOfIssue).toHaveBeenCalledWith(
        {
          number: 42,
          html_url:
            'https://github.com/michaelpipkin/pip-cost-sharing/issues/42',
          title: 'Test Issue',
          body: 'Issue body text',
        },
        'Issue body text',
        ''
      );
    });

    it('should pass the reporter email to notifyAdminOfIssue when provided', async () => {
      setInputValue('issue-email-input', 'user@example.com');
      await fixture.whenStable();
      await component.onSubmit();
      expect(mockHelpService.notifyAdminOfIssue).toHaveBeenCalledWith(
        expect.anything(),
        'Issue body text',
        'user@example.com'
      );
    });

    it('should not call notifyAdminOfIssue when issue creation fails', async () => {
      mockHelpService.createIssue.mockRejectedValue(new Error('API error'));
      await component.onSubmit();
      expect(mockHelpService.notifyAdminOfIssue).not.toHaveBeenCalled();
    });

    it('should still show the success snackbar when the admin notification fails', async () => {
      mockHelpService.notifyAdminOfIssue.mockRejectedValue(
        new Error('Notify failed')
      );
      await component.onSubmit();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: { message: 'Issue submitted. Thank you!' },
        })
      );
    });

    it('should call loadingOn and loadingOff', async () => {
      await component.onSubmit();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });
});
