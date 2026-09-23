import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { MemberLinkService } from '@services/member-link.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockGroupService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberLinkService,
  createMockMemberStore,
  createMockSnackBar,
  createMockUserStore,
  mockDocRef,
  mockGroup,
  mockUser,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupsComponent } from './groups.component';

describe('GroupsComponent', () => {
  let fixture: ComponentFixture<GroupsComponent>;
  let component: GroupsComponent;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockGroupService: ReturnType<typeof createMockGroupService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockMemberLinkService: ReturnType<typeof createMockMemberLinkService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;

  const testGroup = mockGroup({ name: 'Test Group' });

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockUserStore = createMockUserStore();
    mockGroupService = createMockGroupService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();
    mockMemberLinkService = createMockMemberLinkService();
    mockAnalyticsService = createMockAnalyticsService();
    mockLoadingService = createMockLoadingService();

    await TestBed.configureTestingModule({
      imports: [GroupsComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: createMockMemberStore() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: MemberLinkService, useValue: mockMemberLinkService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('group select', () => {
    it('should render the group select when active groups are available', async () => {
      // Real app invariant: UserService.initializeAuth() always sets
      // userStore.user() before GroupService.getUserGroups() can flip
      // groupStore.loaded() - checkingInvitedMemberLinks() only resolves
      // once an email is known, so this must be set for the page to ever
      // finish its loading gate.
      mockUserStore.user.set(mockUser());
      mockGroupStore.loaded.set(true);
      mockGroupStore.allUserGroups.set([testGroup]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector('[data-testid="group-select"]')
      ).toBeTruthy();
    });
  });

  describe('addGroup', () => {
    it('should open AddGroupComponent dialog', () => {
      component.addGroup();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('onSelectGroup', () => {
    it('should call groupService.getGroup', async () => {
      mockUserStore.user.set(mockUser());
      const groupRef = mockDocRef('groups/group-1');
      await component.onSelectGroup({ value: groupRef } as any);
      expect(mockGroupService.getGroup).toHaveBeenCalled();
    });

    it('should turn the loading overlay off even when getGroup rejects', async () => {
      mockUserStore.user.set(mockUser());
      mockGroupService.getGroup.mockRejectedValueOnce(new Error('boom'));
      mockLoadingService.loadingOff.mockClear();
      const groupRef = mockDocRef('groups/group-1');
      await expect(
        component.onSelectGroup({ value: groupRef } as any)
      ).rejects.toThrow('boom');
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });

  describe('manageGroups', () => {
    it('should open ManageGroupsComponent dialog', () => {
      component.manageGroups();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('invited-member linking on page load', () => {
    it('calls linkInvitedMembers once the user email is known', async () => {
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledWith(
        'test@example.com'
      );
      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledTimes(
        1
      );
    });

    it('does not call it again if unrelated signals change afterward', async () => {
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();

      mockGroupStore.allUserGroups.set([testGroup]);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockMemberLinkService.linkInvitedMembers).toHaveBeenCalledTimes(
        1
      );
    });

    it('logs a members_linked event when the attempt links something', async () => {
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(2);
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
        'members_linked',
        { email: 'test@example.com', membersLinked: 2 }
      );
    });

    it('does not log an event when nothing was linked', async () => {
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(0);
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAnalyticsService.logEvent).not.toHaveBeenCalled();
    });

    it('does not log an event when the attempt was skipped (no App Check token)', async () => {
      mockMemberLinkService.linkInvitedMembers.mockResolvedValueOnce(null);
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAnalyticsService.logEvent).not.toHaveBeenCalled();
    });

    describe('loading overlay', () => {
      it('stays on once groups have loaded while the link attempt is still pending', async () => {
        let resolveLink!: (value: number | null) => void;
        mockMemberLinkService.linkInvitedMembers.mockReturnValueOnce(
          new Promise((resolve) => {
            resolveLink = resolve;
          })
        );
        mockUserStore.user.set(mockUser());
        mockGroupStore.loaded.set(true);
        fixture.detectChanges();
        await fixture.whenStable();

        expect(mockLoadingService.loadingOff).not.toHaveBeenCalled();

        resolveLink(0);
        await Promise.resolve();
        fixture.detectChanges();
        await fixture.whenStable();

        expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      });
    });
  });
});
