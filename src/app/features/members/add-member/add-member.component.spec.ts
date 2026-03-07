import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
  createMockDialogRef,
  createMockGroupService,
  createMockLoadingService,
  createMockSnackBar,
  createMockUserStore,
  mockDocRef,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMemberComponent } from './add-member.component';

describe('AddMemberComponent', () => {
  let fixture: ComponentFixture<AddMemberComponent>;
  let component: AddMemberComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockMemberService: { addMemberToGroup: ReturnType<typeof vi.fn> };
  let mockDemoService: ReturnType<typeof createMockDemoService>;

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockDemoService = createMockDemoService();
    mockMemberService = {
      addMemberToGroup: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AddMemberComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { groupId: mockDocRef('groups/group-1') },
        },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserStore, useValue: createMockUserStore() },
        { provide: MemberService, useValue: mockMemberService },
        { provide: GroupService, useValue: createMockGroupService() },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddMemberComponent);
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

    it('should disable Save when name is filled but email is empty', async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const saveBtn = query('add-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should disable Save when email is invalid', async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));

      const emailInput = query('member-email-input') as HTMLInputElement;
      emailInput.value = 'not-an-email';
      emailInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const saveBtn = query('add-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when name and valid email are provided', async () => {
      const nameInput = query('member-name-input') as HTMLInputElement;
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));

      const emailInput = query('member-email-input') as HTMLInputElement;
      emailInput.value = 'alice@example.com';
      emailInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

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

    it('should block submit and show restriction message in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockMemberService.addMemberToGroup).not.toHaveBeenCalled();
    });
  });
});
