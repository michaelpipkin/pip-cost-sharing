import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  DuplicateMemberEmailError,
  MemberService,
} from '@services/member.service';
import {
  createMockAnalyticsService,
  createMockDialogRef,
  createMockLoadingService,
  createMockSnackBar,
  mockDocRef,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMemberComponent } from './add-member.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('AddMemberComponent', () => {
  let fixture: ComponentFixture<AddMemberComponent>;
  let component: AddMemberComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockMemberService: { addMemberToGroup: ReturnType<typeof vi.fn> };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockMemberService = {
      addMemberToGroup: vi.fn().mockResolvedValue(undefined),
    };
    mockSnackBar = createMockSnackBar();
    mockAnalytics = createMockAnalyticsService();

    await TestBed.configureTestingModule({
      imports: [AddMemberComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { groupId: mockDocRef('groups/group-1') },
        },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MemberService, useValue: mockMemberService },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddMemberComponent);
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the dialog title', () => {
      expect(query('add-member-title')?.textContent?.trim()).toBe('Add Member');
    });

    it('should render the name input', () => {
      expect(query('member-name-input')).toBeTruthy();
    });

    it('should render the email input', () => {
      expect(query('member-email-input')).toBeTruthy();
    });

    it('should render Save and Cancel buttons', () => {
      expect(query('add-member-save-button')).toBeTruthy();
      expect(query('add-member-cancel-button')).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('should disable Save when form is invalid (empty)', () => {
      const saveBtn = query('add-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when name is filled and email is empty (email is optional)', async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();

      const saveBtn = query('add-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    // a@b passed Angular's built-in email validator; the app now requires a
    // dotted domain (utilities/email-validation.ts).
    it.each(['not-an-email', 'a@b', 'a@x.com,b@y.com'])(
      'should disable Save and show the email error when email is %s',
      async (email) => {
        const nameInput = query('member-name-input') as HTMLInputElement;
        nameInput.value = 'Alice';
        nameInput.dispatchEvent(new Event('input'));

        const emailInput = query('member-email-input') as HTMLInputElement;
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('input'));
        emailInput.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        fixture.detectChanges();

        const saveBtn = query('add-member-save-button') as HTMLButtonElement;
        expect(saveBtn.disabled).toBe(true);
        expect(query('member-email-error-0')?.textContent).toContain(
          'Not a valid email address'
        );
      }
    );

    it('should enable Save when name and valid email are provided', async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));

      const emailInput = query('member-email-input') as HTMLInputElement;
      emailInput.value = 'alice@example.com';
      emailInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();

      const saveBtn = query('add-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });

  describe('onSubmit', () => {
    beforeEach(async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));

      const emailInput = query('member-email-input') as HTMLInputElement;
      emailInput.value = 'alice@example.com';
      emailInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    });

    it('should call memberService.addMemberToGroup on submit', async () => {
      await component.onSubmit();
      expect(mockMemberService.addMemberToGroup).toHaveBeenCalled();
    });

    it('should close the dialog with true on success', async () => {
      await component.onSubmit();
      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });

    // An address another member already has is an outcome for the admin,
    // not an app error: shown, not logged, dialog left open.
    it('should show the duplicate-address refusal without logging it', async () => {
      mockMemberService.addMemberToGroup.mockRejectedValue(
        new DuplicateMemberEmailError()
      );

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message: 'Another member of this group already uses that address.',
          },
        }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('should log any other failure', async () => {
      mockMemberService.addMemberToGroup.mockRejectedValue(new Error('boom'));

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'boom' } }
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Add Member Component',
        'add_member',
        'boom'
      );
    });
  });

  it("should end the form's Enter order on Save", () => {
    expectEnterEndsOnSave(fixture);
  });
});
