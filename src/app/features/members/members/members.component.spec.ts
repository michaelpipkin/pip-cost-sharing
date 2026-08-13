import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { MemberInvite } from '@models/member';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { InviteService } from '@services/invite.service';
import { SortingService } from '@services/sorting.service';
import { TourService } from '@services/tour.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
  createMockGroupStore,
  createMockInviteService,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSortingService,
  createMockTourService,
  createMockUserStore,
  mockDocRef,
  mockGroup,
  mockMember,
  mockUser,
} from '@testing/test-helpers';
import { Timestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembersComponent } from './members.component';

// The testing setup aliases 'firebase/firestore' to a lightweight mock (see
// src/testing/mocks/firebase-firestore.mock.ts) whose Timestamp has no
// fromMillis and always resolves toMillis() to 0, so canInvite's cooldown
// math is exercised by overriding toMillis() directly on each instance.
function mockTimestamp(millis: number): Timestamp {
  const ts = new Timestamp();
  ts.toMillis = vi.fn().mockReturnValue(millis);
  return ts;
}

function mockInvite(overrides: Partial<MemberInvite> = {}): MemberInvite {
  return {
    lastSentAt: mockTimestamp(Date.now()),
    lastSentTo: 'test@example.com',
    sendCount: 1,
    ...overrides,
  };
}

describe('MembersComponent', () => {
  let fixture: ComponentFixture<MembersComponent>;
  let component: MembersComponent;
  let el: HTMLElement;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockInviteService: ReturnType<typeof createMockInviteService>;

  function createMockBreakpointObserver(matches = false) {
    return {
      observe: vi.fn(() => ({
        subscribe: (callback: (result: any) => void) => {
          callback({ matches, breakpoints: {} });
          return { unsubscribe: vi.fn() };
        },
      })),
    };
  }

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockDemoService = createMockDemoService();
    mockTourService = createMockTourService();
    mockDialog = createMockMatDialog();
    mockAnalytics = createMockAnalyticsService();
    mockInviteService = createMockInviteService();

    mockUserStore.user.set(mockUser());
    mockGroupStore.currentGroup.set(mockGroup({ name: 'Test Group' }));
    mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));
    mockMemberStore.groupMembers.set([
      mockMember({
        id: 'member-1',
        displayName: 'Alice',
        email: 'alice@example.com',
        active: true,
        groupAdmin: true,
      }),
      mockMember({
        id: 'member-2',
        displayName: 'Bob',
        email: 'bob@example.com',
        active: true,
        groupAdmin: false,
      }),
      mockMember({
        id: 'member-3',
        displayName: 'Charlie',
        email: 'charlie@example.com',
        active: false,
        groupAdmin: false,
      }),
    ]);

    await TestBed.configureTestingModule({
      imports: [MembersComponent],
      providers: [
        provideRouter([]),
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: SortingService, useValue: createMockSortingService() },
        { provide: MatDialog, useValue: mockDialog },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: DemoService, useValue: mockDemoService },
        { provide: TourService, useValue: mockTourService },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: InviteService, useValue: mockInviteService },
        {
          provide: BreakpointObserver,
          useValue: createMockBreakpointObserver(false),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MembersComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('loading state', () => {
    it('should show loading message when members are not loaded', async () => {
      mockMemberStore.loaded.set(false);
      await fixture.whenStable();

      expect(query('loading-members-message')?.textContent?.trim()).toBe(
        'Loading members...'
      );
      expect(query('members-main-container')).toBeFalsy();
    });

    it('should show main content when members are loaded', () => {
      expect(query('members-main-container')).toBeTruthy();
      expect(query('loading-members-message')).toBeFalsy();
    });
  });

  describe('initial render', () => {
    it('should render page title', () => {
      expect(query('members-page-title')?.textContent?.trim()).toBe('Members');
    });

    it('should display current group name', () => {
      expect(query('current-group-name')?.textContent?.trim()).toBe(
        'Test Group'
      );
    });

    it('should render search input', () => {
      expect(query('member-search-input')).toBeTruthy();
    });

    it('should render active-only toggle', () => {
      expect(query('active-members-only-toggle')).toBeTruthy();
    });

    it('should render help button', () => {
      expect(query('members-help-button')).toBeTruthy();
    });

    it('should not show tour button when not in demo mode', () => {
      expect(query('members-tour-button')).toBeFalsy();
    });
  });

  describe('members table', () => {
    it('should display members table when members exist', () => {
      expect(query('members-table')).toBeTruthy();
    });

    it('should show only active members by default', () => {
      const rows = el.querySelectorAll('[data-testid^="member-row-"]');
      expect(rows.length).toBe(2);
    });

    it('should show all members when activeOnly is false', async () => {
      component.activeOnly.set(false);
      await fixture.whenStable();

      const rows = el.querySelectorAll('[data-testid^="member-row-"]');
      expect(rows.length).toBe(3);
    });

    it('should show "No members found" when no members match', async () => {
      component.nameFilter.set('zzzzz');
      await fixture.whenStable();

      expect(query('no-members-message')?.textContent?.trim()).toBe(
        'No members found'
      );
    });

    it('should filter members by name', async () => {
      component.nameFilter.set('alice');
      await fixture.whenStable();

      const rows = el.querySelectorAll('[data-testid^="member-row-"]');
      expect(rows.length).toBe(1);
    });

    it('should filter members by email', async () => {
      component.nameFilter.set('bob@');
      await fixture.whenStable();

      const rows = el.querySelectorAll('[data-testid^="member-row-"]');
      expect(rows.length).toBe(1);
    });
  });

  describe('responsive columns', () => {
    it('should use wide columns when not matching breakpoint', () => {
      expect(component.columnsToDisplay()).toEqual([
        'displayName',
        'email',
        'active',
        'groupAdmin',
      ]);
    });

    it('should use narrow columns when matching breakpoint', async () => {
      await TestBed.resetTestingModule();

      mockUserStore = createMockUserStore();
      mockGroupStore = createMockGroupStore();
      mockMemberStore = createMockMemberStore();
      mockDemoService = createMockDemoService();
      mockTourService = createMockTourService();
      mockDialog = createMockMatDialog();
      mockAnalytics = createMockAnalyticsService();
      mockInviteService = createMockInviteService();

      mockUserStore.user.set(mockUser());
      mockGroupStore.currentGroup.set(mockGroup());
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));
      mockMemberStore.groupMembers.set([mockMember()]);

      await TestBed.configureTestingModule({
        imports: [MembersComponent],
        providers: [
          provideRouter([]),
          { provide: UserStore, useValue: mockUserStore },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: MemberStore, useValue: mockMemberStore },
          { provide: SortingService, useValue: createMockSortingService() },
          { provide: MatDialog, useValue: mockDialog },
          { provide: LoadingService, useValue: createMockLoadingService() },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: DemoService, useValue: mockDemoService },
          { provide: TourService, useValue: mockTourService },
          { provide: AnalyticsService, useValue: mockAnalytics },
          { provide: InviteService, useValue: mockInviteService },
          {
            provide: BreakpointObserver,
            useValue: createMockBreakpointObserver(true),
          },
        ],
      }).compileComponents();

      const narrowFixture = TestBed.createComponent(MembersComponent);
      const narrowComponent = narrowFixture.componentInstance;
      await narrowFixture.whenStable();

      expect(narrowComponent.columnsToDisplay()).toEqual([
        'nameEmail',
        'active',
        'groupAdmin',
      ]);
    });
  });

  describe('admin controls', () => {
    it('should show Add Member button for group admin', () => {
      expect(query('add-member-button')).toBeTruthy();
    });

    it('should not render Add Member button for non-admin', async () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      await fixture.whenStable();

      expect(query('add-member-button')).toBeFalsy();
    });
  });

  describe('demo mode', () => {
    it('should block addMember and show restriction message', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.addMember();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should block onRowClick and show restriction message', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.onRowClick(mockMember());

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('methods', () => {
    it('should open add dialog when not in demo mode', () => {
      component.addMember();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open edit dialog on row click for admin', () => {
      component.onRowClick(mockMember());
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open edit dialog for own member row (non-admin)', () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      const ownMember = mockMember({
        userRef: mockDocRef('users/user-1'),
      });
      component.onRowClick(ownMember);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should not open edit dialog for other member row (non-admin)', () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      const otherMember = mockMember({
        userRef: mockDocRef('users/other-user'),
      });
      component.onRowClick(otherMember);
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should open help dialog on showHelp', () => {
      component.showHelp();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should delegate startTour to tourService', () => {
      component.startTour();
      expect(mockTourService.startMembersTour).toHaveBeenCalledWith(true);
    });

    it('should update sort signals on sortMembers', () => {
      component.sortMembers({ active: 'email', direction: 'desc' });
      expect(component.sortField()).toBe('email');
      expect(component.sortAsc()).toBe(false);
    });

    it('should map the mobile nameEmail column to displayName when sorting', () => {
      component.sortMembers({ active: 'nameEmail', direction: 'asc' });
      expect(component.sortField()).toBe('displayName');
    });
  });

  describe('canInvite', () => {
    it('returns false when the member already has a userRef', () => {
      const member = mockMember({
        userRef: mockDocRef('users/user-1'),
        active: true,
        email: 'alex@example.com',
      });
      expect(component.canInvite(member)).toBe(false);
    });

    it('returns false when the member is inactive', () => {
      const member = mockMember({
        userRef: null,
        active: false,
        email: 'alex@example.com',
      });
      expect(component.canInvite(member)).toBe(false);
    });

    it.each([['nope'], [''], [undefined as unknown as string]])(
      'returns false for a missing or invalid email address (%s)',
      (email) => {
        const member = mockMember({ userRef: null, active: true, email });
        expect(component.canInvite(member)).toBe(false);
      }
    );

    it('returns true when there is no existing invite record', () => {
      const member = mockMember({
        userRef: null,
        active: true,
        email: 'alex@example.com',
      });
      expect(component.canInvite(member)).toBe(true);
    });

    it('returns true when the invite was sent to a different address', () => {
      const member = mockMember({
        userRef: null,
        active: true,
        email: 'alex@example.com',
        invite: mockInvite({ lastSentTo: 'old@example.com' }),
      });
      expect(component.canInvite(member)).toBe(true);
    });

    it('returns false when the same address was invited less than 24 hours ago', () => {
      const member = mockMember({
        userRef: null,
        active: true,
        email: 'alex@example.com',
        invite: mockInvite({
          lastSentTo: 'alex@example.com',
          lastSentAt: mockTimestamp(Date.now() - 60 * 60 * 1000),
        }),
      });
      expect(component.canInvite(member)).toBe(false);
    });

    it('still returns false (throttled) when lastSentTo and email differ only by casing', () => {
      const member = mockMember({
        userRef: null,
        active: true,
        email: 'alex@example.com',
        invite: mockInvite({
          lastSentTo: 'Alex@Example.com',
          lastSentAt: mockTimestamp(Date.now() - 60 * 60 * 1000),
        }),
      });
      expect(component.canInvite(member)).toBe(false);
    });

    it('returns true once 24 hours have passed since the last send to the same address', () => {
      const member = mockMember({
        userRef: null,
        active: true,
        email: 'alex@example.com',
        invite: mockInvite({
          lastSentTo: 'alex@example.com',
          lastSentAt: mockTimestamp(Date.now() - 25 * 60 * 60 * 1000),
        }),
      });
      expect(component.canInvite(member)).toBe(true);
    });
  });

  describe('invite column', () => {
    it('is hidden by default (all fixture members already have a userRef)', () => {
      expect(component.columnsToDisplay()).not.toContain('invite');
    });

    it('appears, appended last, when a visible member qualifies', async () => {
      mockMemberStore.groupMembers.set([
        ...mockMemberStore.groupMembers(),
        mockMember({
          id: 'member-4',
          displayName: 'Dana',
          email: 'dana@example.com',
          active: true,
          userRef: null,
        }),
      ]);
      await fixture.whenStable();

      const columns = component.columnsToDisplay();
      expect(columns).toContain('invite');
      expect(columns.at(-1)).toBe('invite');
    });

    it('is hidden for non-admins even when a member qualifies', async () => {
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: false }));
      mockMemberStore.groupMembers.set([
        ...mockMemberStore.groupMembers(),
        mockMember({
          id: 'member-4',
          displayName: 'Dana',
          email: 'dana@example.com',
          active: true,
          userRef: null,
        }),
      ]);
      await fixture.whenStable();

      expect(component.columnsToDisplay()).not.toContain('invite');
    });

    it('stays hidden for an inactive candidate even when Active-only is off (canInvite requires active)', async () => {
      mockMemberStore.groupMembers.set([
        ...mockMemberStore.groupMembers(),
        mockMember({
          id: 'member-4',
          displayName: 'Dana',
          email: 'dana@example.com',
          active: false,
          userRef: null,
        }),
      ]);
      component.activeOnly.set(false);
      await fixture.whenStable();

      expect(component.columnsToDisplay()).not.toContain('invite');
    });

    it('respects the name filter for the invitable member', async () => {
      mockMemberStore.groupMembers.set([
        ...mockMemberStore.groupMembers(),
        mockMember({
          id: 'member-4',
          displayName: 'Dana',
          email: 'dana@example.com',
          active: true,
          userRef: null,
        }),
      ]);
      component.nameFilter.set('alice');
      await fixture.whenStable();
      expect(component.columnsToDisplay()).not.toContain('invite');

      component.nameFilter.set('');
      await fixture.whenStable();
      expect(component.columnsToDisplay()).toContain('invite');
    });

    it('renders the invite button only for qualifying rows', async () => {
      mockMemberStore.groupMembers.set([
        ...mockMemberStore.groupMembers(),
        mockMember({
          id: 'member-4',
          displayName: 'Dana',
          email: 'dana@example.com',
          active: true,
          userRef: null,
        }),
      ]);
      await fixture.whenStable();

      expect(query('invite-member-button-member-4')).toBeTruthy();
      expect(query('invite-member-button-member-1')).toBeFalsy();
    });
  });

  describe('sendInvite', () => {
    const invitableMember = () =>
      mockMember({
        id: 'member-4',
        displayName: 'Dana',
        email: 'dana@example.com',
        active: true,
        userRef: null,
      });

    it('blocks and shows the restriction message in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.sendInvite(invitableMember());

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('opens a confirm dialog naming the member', () => {
      component.sendInvite(invitableMember());

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            confirmationText: expect.stringContaining('Dana'),
          }),
        })
      );
    });

    it('does nothing when the confirm dialog is cancelled', async () => {
      mockDialog.open.mockReturnValueOnce({
        afterClosed: () => ({
          subscribe: (cb: (result: boolean) => void) => cb(false),
        }),
      } as any);

      component.sendInvite(invitableMember());
      await fixture.whenStable();

      expect(mockInviteService.sendGroupInvite).not.toHaveBeenCalled();
    });

    it('sends the invite, logs the event, and shows a success snackbar when confirmed', async () => {
      mockDialog.open.mockReturnValueOnce({
        afterClosed: () => ({
          subscribe: (cb: (result: boolean) => void) => cb(true),
        }),
      } as any);

      const member = invitableMember();
      component.sendInvite(member);
      await fixture.whenStable();

      expect(mockInviteService.sendGroupInvite).toHaveBeenCalledWith(
        'group-1',
        'member-4'
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('group_invite_sent');
    });

    it('shows the server error message and logs it when the callable rejects', async () => {
      mockDialog.open.mockReturnValueOnce({
        afterClosed: () => ({
          subscribe: (cb: (result: boolean) => void) => cb(true),
        }),
      } as any);
      mockInviteService.sendGroupInvite.mockRejectedValueOnce(
        new Error('An invitation was already sent to this address recently.')
      );

      component.sendInvite(invitableMember());
      await fixture.whenStable();

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Members Component',
        'send_group_invite',
        'Failed to send group invite',
        'An invitation was already sent to this address recently.'
      );
    });
  });
});
