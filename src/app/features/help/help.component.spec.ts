import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
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
  let mockHelpService: { createIssue: ReturnType<typeof vi.fn> };
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
      createIssue: vi.fn().mockResolvedValue({}),
    };
    mockHelpContentService = {
      getAllHelpSections: vi.fn().mockReturnValue(mockSections),
    };

    await TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [
        provideNoopAnimations(),
        { provide: HelpService, useValue: mockHelpService },
        { provide: HelpContentService, useValue: mockHelpContentService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HelpComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load help sections from HelpContentService on init', () => {
    expect(mockHelpContentService.getAllHelpSections).toHaveBeenCalled();
    expect(component.helpSections).toEqual(mockSections);
  });

  describe('issueForm', () => {
    it('should be invalid when empty', () => {
      expect(component.issueForm.invalid).toBe(true);
    });

    it('should be valid with title and body', () => {
      component.f.title.setValue('Test Issue');
      component.f.body.setValue('This is the body of the issue.');
      expect(component.issueForm.valid).toBe(true);
    });

    it('should be invalid when title is missing', () => {
      component.f.body.setValue('Body text');
      expect(component.issueForm.invalid).toBe(true);
    });

    it('should be invalid when body is missing', () => {
      component.f.title.setValue('Title');
      expect(component.issueForm.invalid).toBe(true);
    });

    it('should mark email as invalid with bad format', () => {
      component.f.email.setValue('not-an-email');
      expect(component.f.email.invalid).toBe(true);
    });

    it('should mark email as valid with proper format', () => {
      component.f.email.setValue('user@example.com');
      expect(component.f.email.valid).toBe(true);
    });
  });

  describe('clearForm', () => {
    it('should reset form values', () => {
      component.f.title.setValue('Title');
      component.f.body.setValue('Body');
      component.clearForm();
      expect(component.f.title.value).toBeNull();
      expect(component.f.body.value).toBeNull();
    });

    it('should mark form as pristine and untouched', () => {
      component.f.title.markAsDirty();
      component.f.body.markAsTouched();
      component.clearForm();
      expect(component.issueForm.pristine).toBe(true);
      expect(component.issueForm.untouched).toBe(true);
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => {
      component.f.title.setValue('Test Issue');
      component.f.body.setValue('Issue body text');
    });

    it('should call helpService.createIssue with title and body', async () => {
      await component.onSubmit();
      expect(mockHelpService.createIssue).toHaveBeenCalledWith(
        'Test Issue',
        'Issue body text'
      );
    });

    it('should append email to body when email is provided', async () => {
      component.f.email.setValue('user@example.com');
      await component.onSubmit();
      expect(mockHelpService.createIssue).toHaveBeenCalledWith(
        'Test Issue',
        'Issue body text\n\nSubmitted by: user@example.com'
      );
    });

    it('should clear form on success', async () => {
      await component.onSubmit();
      expect(component.f.title.value).toBeNull();
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

    it('should call loadingOn and loadingOff', async () => {
      await component.onSubmit();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });
});
