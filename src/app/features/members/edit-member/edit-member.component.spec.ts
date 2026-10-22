import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDialogRef,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockUserStore,
  mockDocRef,
  mockMember,
  mockUser,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditMemberComponent } from './edit-member.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('EditMemberComponent', () => {
  let fixture: ComponentFixture<EditMemberComponent>;
  let component: EditMemberComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockMemberService: {
    updateMember: ReturnType<typeof vi.fn>;
    updateMemberWithUserMatching: ReturnType<typeof vi.fn>;
    requestMemberEmailChange: ReturnType<typeof vi.fn>;
    removeMemberFromGroup: ReturnType<typeof vi.fn>;
    leaveGroup: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockGroupService: { clearCurrentGroup: ReturnType<typeof vi.fn> };

  const userRef = mockDocRef('users/user-1');
  const testUser = mockUser({ id: 'user-1', ref: userRef });
  const otherUserRef = mockDocRef('users/user-other');

  // Member is not the current user
  const testMember = mockMember({
    id: 'member-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    active: true,
    groupAdmin: false,
    userRef: otherUserRef,
  });

  // Member IS the current user
  const selfMember = mockMember({
    id: 'member-self',
    displayName: 'Me',
    email: 'me@example.com',
    active: true,
    groupAdmin: false,
    userRef: userRef,
  });

  // Members passes the current group's id (members.component editMember).
  const groupId = 'group-1';

  // Member not linked to any account yet
  const unlinkedMember = mockMember({
    id: 'member-unlinked',
    displayName: 'Uma',
    email: 'uma@example.com',
    active: true,
    groupAdmin: false,
    userRef: null,
  });

  async function createComponent(member: typeof testMember) {
    mockDialogRef = createMockDialogRef();
    mockDialog = createMockMatDialog();
    mockUserStore = createMockUserStore();
    mockMemberStore = createMockMemberStore();
    mockGroupStore = createMockGroupStore();
    mockGroupService = { clearCurrentGroup: vi.fn() };
    mockMemberService = {
      updateMember: vi.fn().mockResolvedValue(undefined),
      updateMemberWithUserMatching: vi.fn().mockResolvedValue(undefined),
      requestMemberEmailChange: vi.fn().mockResolvedValue('pending'),
      removeMemberFromGroup: vi.fn().mockResolvedValue(undefined),
      leaveGroup: vi.fn().mockResolvedValue(undefined),
    };
    mockSnackBar = createMockSnackBar();

    mockUserStore.user.set(testUser);
    mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));

    await TestBed.configureTestingModule({
      imports: [EditMemberComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { member, groupId },
        },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MemberService, useValue: mockMemberService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditMemberComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  async function typeInto(testId: string, value: string): Promise<void> {
    const input = query(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const LOCKED_HINT =
    'Only the member can change their email address once it is linked to their profile.';

  describe('when editing another member (non-current-user)', () => {
    beforeEach(async () => {
      await createComponent(testMember);
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display the dialog title', () => {
      expect(query('edit-member-title')?.textContent?.trim()).toBe(
        'Edit Member'
      );
    });

    it('should pre-populate name input with member display name', () => {
      const nameInput = query('edit-member-name-input') as HTMLInputElement;
      expect(nameInput.value).toBe('Alice');
    });

    it('should pre-populate email input with member email', () => {
      const emailInput = query('edit-member-email-input') as HTMLInputElement;
      expect(emailInput.value).toBe('alice@example.com');
    });

    it('should show Remove button (not Leave Group) for other members', () => {
      expect(query('remove-member-button')).toBeTruthy();
      expect(query('leave-group-button')).toBeFalsy();
    });

    it('should disable Save when form is pristine', () => {
      const saveBtn = query('edit-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when name is changed', async () => {
      const nameInput = query('edit-member-name-input') as HTMLInputElement;
      nameInput.value = 'Alicia';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      fixture.detectChanges();

      const saveBtn = query('edit-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });

    // B19: a linked member's email is theirs to change (with a confirmed
    // address); an admin editing someone else's linked row can't.
    it('should lock the email field with a hint for a linked member', () => {
      const emailInput = query('edit-member-email-input') as HTMLInputElement;
      expect(emailInput.disabled).toBe(true);
      expect(query('edit-member-email-hint')?.textContent?.trim()).toBe(
        LOCKED_HINT
      );
    });

    it('should save other fields the admin way, with the email unchanged', async () => {
      await typeInto('edit-member-name-input', 'Alicia');

      await component.onSubmit();

      expect(mockMemberService.updateMemberWithUserMatching).toHaveBeenCalledWith(
        testMember.ref,
        {
          displayName: 'Alicia',
          email: 'alice@example.com',
          active: true,
          groupAdmin: false,
        },
        otherUserRef,
        'alice@example.com'
      );
      expect(mockMemberService.requestMemberEmailChange).not.toHaveBeenCalled();
    });

    it('should call memberService.updateMemberWithUserMatching on submit', async () => {
      const nameInput = query('edit-member-name-input') as HTMLInputElement;
      nameInput.value = 'Alicia';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      await component.onSubmit();
      expect(mockMemberService.updateMemberWithUserMatching).toHaveBeenCalled();
    });

    it('should close dialog with saved result on success', async () => {
      const nameInput = query('edit-member-name-input') as HTMLInputElement;
      nameInput.value = 'Alicia';
      nameInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      await component.onSubmit();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
    });

    it('should open a delete confirmation dialog on removeMember', () => {
      // EditMemberComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.removeMember();
      expect(dialogSpy).toHaveBeenCalled();
    });
  });

  describe('when editing a member not linked to an account', () => {
    beforeEach(async () => {
      await createComponent(unlinkedMember);
    });

    it('should leave the email field editable, with the usual hint', () => {
      const emailInput = query('edit-member-email-input') as HTMLInputElement;
      expect(emailInput.disabled).toBe(false);
      expect(query('edit-member-email-hint')?.textContent).not.toContain(
        LOCKED_HINT
      );
    });

    // a@b passed Angular's built-in email validator; the app now requires one
    // address with a dotted domain (utilities/email-validation.ts).
    it.each(['a@b', 'alice@example.com,bob@example.com'])(
      'should disable Save and show the email error when email is %s',
      async (email) => {
        const emailInput = query(
          'edit-member-email-input'
        ) as HTMLInputElement;
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('input'));
        emailInput.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        fixture.detectChanges();

        const saveBtn = query('edit-member-save-button') as HTMLButtonElement;
        expect(saveBtn.disabled).toBe(true);
        expect(query('edit-member-email-error-0')?.textContent).toContain(
          'Not a valid email address'
        );
      }
    );

    it('should save a new email directly, matching it to a user (no confirmation)', async () => {
      await typeInto('edit-member-email-input', 'uma.new@example.com');

      await component.onSubmit();

      expect(mockMemberService.updateMemberWithUserMatching).toHaveBeenCalledWith(
        unlinkedMember.ref,
        {
          displayName: 'Uma',
          email: 'uma.new@example.com',
          active: true,
          groupAdmin: false,
        },
        null,
        'uma@example.com'
      );
      expect(mockMemberService.requestMemberEmailChange).not.toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
    });
  });

  describe('when editing own linked member record: the email change', () => {
    beforeEach(async () => {
      await createComponent(selfMember);
    });

    it('should leave the email field editable', () => {
      const emailInput = query('edit-member-email-input') as HTMLInputElement;
      expect(emailInput.disabled).toBe(false);
      expect(query('edit-member-email-hint')?.textContent).not.toContain(
        LOCKED_HINT
      );
    });

    it('should save other fields directly and never write the email itself', async () => {
      await typeInto('edit-member-name-input', 'Myself');

      await component.onSubmit();

      expect(mockMemberService.updateMember).toHaveBeenCalledWith(
        selfMember.ref,
        { displayName: 'Myself', active: true, groupAdmin: false }
      );
      expect(mockMemberService.requestMemberEmailChange).not.toHaveBeenCalled();
      expect(
        mockMemberService.updateMemberWithUserMatching
      ).not.toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
    });

    it('should not ask the server about a change of letter case only', async () => {
      await typeInto('edit-member-email-input', 'ME@example.com');

      await component.onSubmit();

      expect(mockMemberService.requestMemberEmailChange).not.toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
    });

    it('should send a changed email through requestMemberEmailChange', async () => {
      await typeInto('edit-member-name-input', 'Myself');
      await typeInto('edit-member-email-input', 'me.new@example.com');

      await component.onSubmit();

      expect(mockMemberService.requestMemberEmailChange).toHaveBeenCalledWith(
        groupId,
        'member-self',
        'me.new@example.com'
      );
      expect(mockMemberService.updateMember).toHaveBeenCalledWith(
        selfMember.ref,
        { displayName: 'Myself', active: true, groupAdmin: false }
      );
      expect(
        mockMemberService.updateMemberWithUserMatching
      ).not.toHaveBeenCalled();
    });

    it.each(['updated', 'unchanged'])(
      'should show the normal saved message when the change is %s',
      async (status) => {
        mockMemberService.requestMemberEmailChange.mockResolvedValue(status);
        await typeInto('edit-member-email-input', 'me.login@example.com');

        await component.onSubmit();

        expect(mockMemberService.requestMemberEmailChange).toHaveBeenCalled();
        expect(mockDialogRef.close).toHaveBeenCalledWith({
          success: true,
          operation: 'saved',
        });
      }
    );

    it('should say a confirmation link was sent when the change is pending', async () => {
      mockMemberService.requestMemberEmailChange.mockResolvedValue('pending');
      await typeInto('edit-member-email-input', 'me.new@example.com');

      await component.onSubmit();

      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
        message:
          'We sent a confirmation link to me.new@example.com. Your group email will change once you confirm it.',
      });
    });

    it('should explain the daily limit and keep the dialog open (resource-exhausted)', async () => {
      mockMemberService.requestMemberEmailChange.mockRejectedValue(
        Object.assign(new Error('Too many'), {
          code: 'functions/resource-exhausted',
        })
      );
      await typeInto('edit-member-email-input', 'me.new@example.com');

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message:
              'Too many email change requests. Please try again tomorrow.',
          },
        }
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(mockMemberService.updateMember).not.toHaveBeenCalled();
    });

    it("should show the server's message for any other refusal", async () => {
      mockMemberService.requestMemberEmailChange.mockRejectedValue(
        Object.assign(
          new Error(
            'A member with this email address already exists in the group.'
          ),
          { code: 'functions/already-exists' }
        )
      );
      await typeInto('edit-member-email-input', 'taken@example.com');

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message:
              'A member with this email address already exists in the group.',
          },
        }
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('when the member left the group voluntarily (leftGroup)', () => {
    const leftMember = mockMember({
      id: 'member-left',
      displayName: 'Bob',
      email: 'bob@example.com',
      active: false,
      groupAdmin: false,
      leftGroup: true,
      userRef: otherUserRef,
    });

    beforeEach(async () => {
      await createComponent(leftMember);
    });

    it('should disable the Active toggle', () => {
      expect((component as any).editMemberForm.active().disabled()).toBe(
        true
      );
    });

    it('should explain why the toggle is locked', () => {
      expect((component as any).activeTooltip).toBe(
        'This member left the group voluntarily. They can rejoin from their own account settings.'
      );
    });
  });

  describe('when a member was merely deactivated by an admin (not leftGroup)', () => {
    const deactivatedMember = mockMember({
      id: 'member-deactivated',
      displayName: 'Carol',
      email: 'carol@example.com',
      active: false,
      groupAdmin: false,
      leftGroup: false,
      userRef: otherUserRef,
    });

    beforeEach(async () => {
      await createComponent(deactivatedMember);
    });

    it('should not show the leftGroup tooltip', () => {
      expect((component as any).activeTooltip).toBe('');
    });
  });

  describe('when editing own member record (current user)', () => {
    beforeEach(async () => {
      await createComponent(selfMember);
    });

    it('should show Leave Group button (not Remove) for current user', () => {
      expect(query('leave-group-button')).toBeTruthy();
      expect(query('remove-member-button')).toBeFalsy();
    });

    it('should open a confirm dialog on leaveGroup', () => {
      // EditMemberComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.leaveGroup();
      expect(dialogSpy).toHaveBeenCalled();
    });

    it('should remove the group from the store when leaving deletes the member doc (no history)', async () => {
      mockMemberService.leaveGroup.mockResolvedValue({ deleted: true });
      vi.spyOn((component as any)['router'], 'navigate').mockResolvedValue(true);
      let confirmCallback!: (confirm: boolean) => Promise<void>;
      vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
        afterClosed: () => ({
          subscribe: (cb: (confirm: boolean) => Promise<void>) => {
            confirmCallback = cb;
            return { unsubscribe: vi.fn() };
          },
        }),
      });

      component.leaveGroup();
      await confirmCallback(true);

      expect(mockGroupStore.removeGroup).toHaveBeenCalledWith(groupId);
      expect(mockGroupStore.patchGroupMembership).not.toHaveBeenCalled();
    });

    it("should stop the left group's data listeners, not just unselect it", async () => {
      mockMemberService.leaveGroup.mockResolvedValue({ deleted: false });
      vi.spyOn((component as any)['router'], 'navigate').mockResolvedValue(true);
      let confirmCallback!: (confirm: boolean) => Promise<void>;
      vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
        afterClosed: () => ({
          subscribe: (cb: (confirm: boolean) => Promise<void>) => {
            confirmCallback = cb;
            return { unsubscribe: vi.fn() };
          },
        }),
      });

      component.leaveGroup();
      await confirmCallback(true);

      expect(mockGroupService.clearCurrentGroup).toHaveBeenCalledOnce();
    });

    it('should re-tag the group as left in the store when leaving keeps the member doc (has history)', async () => {
      mockMemberService.leaveGroup.mockResolvedValue({ deleted: false });
      vi.spyOn((component as any)['router'], 'navigate').mockResolvedValue(true);
      let confirmCallback!: (confirm: boolean) => Promise<void>;
      vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
        afterClosed: () => ({
          subscribe: (cb: (confirm: boolean) => Promise<void>) => {
            confirmCallback = cb;
            return { unsubscribe: vi.fn() };
          },
        }),
      });

      component.leaveGroup();
      await confirmCallback(true);

      expect(mockGroupStore.patchGroupMembership).toHaveBeenCalledWith(groupId, {
        userActiveInGroup: false,
        userLeftGroup: true,
        userIsAdmin: false,
      });
      expect(mockGroupStore.removeGroup).not.toHaveBeenCalled();
    });
  });

  it("should end the form's Enter order on Save", async () => {
    await createComponent(testMember);
    expectEnterEndsOnSave(fixture);
  });
});
