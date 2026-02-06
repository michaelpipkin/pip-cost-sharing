import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MembersComponent } from './members.component';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SortingService } from '@services/sorting.service';
import { DemoService } from '@services/demo.service';
import { TourService } from '@services/tour.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockUserStore,
  createMockGroupStore,
  createMockMemberStore,
  createMockSortingService,
  createMockLoadingService,
  createMockDemoService,
  createMockTourService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
  mockMember,
  mockUser,
  mockDocRef,
} from '@testing/test-helpers';

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
        provideNoopAnimations(),
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

      mockUserStore.user.set(mockUser());
      mockGroupStore.currentGroup.set(mockGroup());
      mockMemberStore.currentMember.set(mockMember({ groupAdmin: true }));
      mockMemberStore.groupMembers.set([mockMember()]);

      await TestBed.configureTestingModule({
        imports: [MembersComponent],
        providers: [
          provideNoopAnimations(),
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
  });
});
