import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { GuidedTourConfig } from '@models/guided-tour';
import { getFirestore } from 'firebase/firestore';
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
        { provide: getFirestore, useValue: {} },
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
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;
    let dialogRefs: { close: ReturnType<typeof vi.fn> }[];

    beforeEach(() => {
      dialogRefs = [];
      mockDialog.open.mockImplementation((() => {
        const ref = {
          afterClosed: () => ({ subscribe: vi.fn() }),
          afterOpened: () => ({ subscribe: (fn: () => void) => fn() }),
          close: vi.fn(),
        };
        dialogRefs.push(ref);
        return ref;
      }) as any);
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    // The page stays on its loading placeholder until the user's email is
    // known (see 'should render the group select...')
    const loadPage = async () => {
      mockUserStore.user.set(mockUser());
      mockGroupStore.loaded.set(true);
      await render();
    };

    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();
    const query = (id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
    // The invite-link check settles asynchronously, so render again after it
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('should start the groups tour from the help icon', async () => {
      await loadPage();
      query('groups-help-button').click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('groups');
    });

    it('should show sample groups instead of the placeholder when there are none', async () => {
      await loadPage();
      expect(query('no-groups-placeholder')).toBeTruthy();

      component.startTour();
      await render();

      expect(query('no-groups-placeholder')).toBeNull();
      expect(query('group-select')).toBeTruthy();
      expect(query('manage-groups-button')).toBeTruthy();
      expect(
        tourConfig.steps.find((s) => s.id === 'intro')!.text
      ).toContain('two samples');
    });

    it('should clear the sample and put the page back when the tour ends', async () => {
      await loadPage();
      component.startTour();
      await render();
      tourConfig.onEnd!('closed');
      await render();

      expect(query('no-groups-placeholder')).toBeTruthy();
      expect(query('manage-groups-button')).toBeNull();
    });

    it('should use real groups instead of samples when the user has some', async () => {
      mockGroupStore.allUserGroups.set([
        mockGroup({
          id: 'g1',
          name: 'Real Group',
          active: true,
          userActiveInGroup: true,
          userIsAdmin: true,
        }),
      ]);
      component.startTour();
      await render();

      expect(
        tourConfig.steps.find((s) => s.id === 'intro')!.text
      ).not.toContain('samples');
      expect(
        tourConfig.steps.find((s) => s.id === 'manage-groups')!.when!()
      ).toBe(true);
    });

    it('should skip the Manage Groups steps for a user who admins no groups', () => {
      mockGroupStore.allUserGroups.set([
        mockGroup({
          id: 'g1',
          active: true,
          userActiveInGroup: true,
          userIsAdmin: false,
        }),
      ]);
      component.startTour();

      expect(
        tourConfig.steps.find((s) => s.id === 'manage-select')!.when!()
      ).toBe(false);
    });

    it('should open each dialog once, swap between them, and close on end', async () => {
      component.startTour();

      await runStep('add-group-names');
      await runStep('add-group-currency');
      expect(mockDialog.open).toHaveBeenCalledTimes(1);

      await runStep('manage-select');
      expect(mockDialog.open).toHaveBeenCalledTimes(2);
      expect(dialogRefs[0]!.close).toHaveBeenCalled();
      const [, manageConfig] = mockDialog.open.mock.calls[1] as unknown as [
        unknown,
        { autoFocus: boolean; data: { tourPreview?: { groups: unknown[] } } },
      ];
      // Sample groups go to the dialog as a preview; tour dialogs don't
      // grab focus from the tour card
      expect(manageConfig.data.tourPreview?.groups).toHaveLength(2);
      expect(manageConfig.autoFocus).toBe(false);

      tourConfig.onEnd!('closed');
      expect(dialogRefs[1]!.close).toHaveBeenCalled();
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
