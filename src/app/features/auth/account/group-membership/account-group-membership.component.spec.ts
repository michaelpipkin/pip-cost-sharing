import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { MemberService } from '@services/member.service';
import { GroupStore } from '@store/group.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockSnackBar,
  mockDocRef,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountGroupMembershipComponent } from './account-group-membership.component';

describe('AccountGroupMembershipComponent', () => {
  let fixture: ComponentFixture<AccountGroupMembershipComponent>;
  let component: AccountGroupMembershipComponent;
  let el: HTMLElement;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockMemberService: { rejoinGroup: ReturnType<typeof vi.fn> };

  const memberRef = mockDocRef('groups/group-1/members/member-1');
  const groupRef = mockDocRef('groups/group-1');
  const leftGroup = {
    id: 'group-1',
    name: 'Old Group',
    ref: groupRef,
    userLeftGroup: true,
    userMemberRef: memberRef,
  } as any;

  async function createComponent(groups: any[] = [leftGroup]) {
    mockGroupStore = createMockGroupStore();
    mockGroupStore.allUserGroups.set(groups);
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();
    mockMemberService = { rejoinGroup: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [AccountGroupMembershipComponent],
      providers: [
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberService, useValue: mockMemberService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountGroupMembershipComponent);
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

  describe('when the user has left groups', () => {
    beforeEach(async () => {
      await createComponent();
    });

    it('should render the form and list the left group', () => {
      expect(query('group-membership-form')).toBeTruthy();
      expect(query('group-membership-empty')).toBeFalsy();
    });

    it('should disable Rejoin Group until a group is selected', () => {
      const button = query('rejoin-group-button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });

    it('should enable Rejoin Group once a group is selected', () => {
      component['selectedGroupRef'].set(groupRef as any);
      fixture.detectChanges();

      const button = query('rejoin-group-button') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('should open a confirm dialog on rejoinGroup', () => {
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({ subscribe: vi.fn() }),
        });
      component['selectedGroupRef'].set(groupRef as any);

      component.rejoinGroup();

      expect(dialogSpy).toHaveBeenCalled();
    });

    it('should call memberService.rejoinGroup with the member ref on confirm', async () => {
      vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
        afterClosed: () => ({
          subscribe: (cb: (confirm: boolean) => void) => cb(true),
        }),
      });
      component['selectedGroupRef'].set(groupRef as any);

      component.rejoinGroup();
      await fixture.whenStable();

      expect(mockMemberService.rejoinGroup).toHaveBeenCalledWith(memberRef);
    });

    it('should not call memberService.rejoinGroup when the dialog is cancelled', async () => {
      vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
        afterClosed: () => ({
          subscribe: (cb: (confirm: boolean) => void) => cb(false),
        }),
      });
      component['selectedGroupRef'].set(groupRef as any);

      component.rejoinGroup();
      await fixture.whenStable();

      expect(mockMemberService.rejoinGroup).not.toHaveBeenCalled();
    });

    it('should block rejoining in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component['selectedGroupRef'].set(groupRef as any);

      component.rejoinGroup();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('when the user has not left any groups', () => {
    beforeEach(async () => {
      await createComponent([]);
    });

    it('should show the empty state instead of the form', () => {
      expect(query('group-membership-empty')).toBeTruthy();
      expect(query('group-membership-form')).toBeFalsy();
    });
  });
});
