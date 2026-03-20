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
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
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

describe('EditMemberComponent', () => {
  let fixture: ComponentFixture<EditMemberComponent>;
  let component: EditMemberComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockMemberService: {
    updateMemberWithUserMatching: ReturnType<typeof vi.fn>;
    removeMemberFromGroup: ReturnType<typeof vi.fn>;
    leaveGroup: ReturnType<typeof vi.fn>;
  };
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;

  const userRef = mockDocRef('users/user-1');
  const testUser = mockUser({ id: 'user-1', ref: userRef });
  const otherMemberRef = mockDocRef('groups/group-1/members/member-other');

  // Member is not the current user
  const testMember = mockMember({
    id: 'member-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    active: true,
    groupAdmin: false,
    userRef: otherMemberRef,
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

  const groupRef = mockDocRef('groups/group-1');

  async function createComponent(member: typeof testMember) {
    mockDialogRef = createMockDialogRef();
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();
    mockUserStore = createMockUserStore();
    mockMemberStore = createMockMemberStore();
    mockGroupStore = createMockGroupStore();
    mockMemberService = {
      updateMemberWithUserMatching: vi.fn().mockResolvedValue(undefined),
      removeMemberFromGroup: vi.fn().mockResolvedValue(undefined),
      leaveGroup: vi.fn().mockResolvedValue(undefined),
    };

    mockUserStore.user.set(testUser);
    mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));

    await TestBed.configureTestingModule({
      imports: [EditMemberComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { member, groupId: groupRef },
        },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberService, useValue: mockMemberService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditMemberComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

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

      const saveBtn = query('edit-member-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
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

    it('should block submit in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(
        mockMemberService.updateMemberWithUserMatching
      ).not.toHaveBeenCalled();
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
  });
});
