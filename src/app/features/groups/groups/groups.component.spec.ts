import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { GroupService } from '@services/group.service';
import { TourService } from '@services/tour.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
  createMockGroupService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockTourService,
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
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;

  const testGroup = mockGroup({ name: 'Test Group' });

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockUserStore = createMockUserStore();
    mockGroupService = createMockGroupService();
    mockDemoService = createMockDemoService();
    mockTourService = createMockTourService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();

    await TestBed.configureTestingModule({
      imports: [GroupsComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: createMockMemberStore() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: TourService, useValue: mockTourService },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
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

  describe('addGroup', () => {
    it('should show demo restriction when in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.addGroup();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should open AddGroupComponent dialog when not in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      component.addGroup();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('onSelectGroup', () => {
    it('should call groupStore.setCurrentGroup in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      const groupRef = mockDocRef('groups/group-1');
      mockGroupStore.allUserGroups.set([testGroup]);

      await component.onSelectGroup({ value: groupRef } as any);
      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalledWith(testGroup);
    });

    it('should call groupService.getGroup when not in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      mockUserStore.user.set(mockUser());
      const groupRef = mockDocRef('groups/group-1');
      await component.onSelectGroup({ value: groupRef } as any);
      expect(mockGroupService.getGroup).toHaveBeenCalled();
    });
  });

  describe('manageGroups', () => {
    it('should show demo restriction when in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.manageGroups();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should open ManageGroupsComponent dialog when not in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      component.manageGroups();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('startTour', () => {
    it('should call tourService.startWelcomeTour with force=true', () => {
      component.startTour();
      expect(mockTourService.startWelcomeTour).toHaveBeenCalledWith(true);
    });
  });

  describe('groupForm', () => {
    it('should initialize with selectedGroupRef control', () => {
      expect(component.groupForm.get('selectedGroupRef')).toBeTruthy();
    });
  });
});
