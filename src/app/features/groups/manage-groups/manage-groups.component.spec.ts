import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { GroupStore } from '@store/group.store';
import {
  createMockAnalyticsService,
  createMockDemoService,
  createMockDialogRef,
  createMockGroupService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageGroupsComponent } from './manage-groups.component';

describe('ManageGroupsComponent', () => {
  let fixture: ComponentFixture<ManageGroupsComponent>;
  let component: ManageGroupsComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockGroupService: ReturnType<typeof createMockGroupService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseService: { hasExpensesForGroup: ReturnType<typeof vi.fn> };

  const testGroup = mockGroup({ id: 'group-1', name: 'Test Group' });

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockGroupService = createMockGroupService();
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();
    mockGroupStore = createMockGroupStore();
    mockExpenseService = {
      hasExpensesForGroup: vi.fn().mockResolvedValue(false),
    };

    vi.mocked(mockGroupService.updateGroup).mockResolvedValue(undefined as any);
    vi.mocked(mockGroupService.deleteGroup).mockResolvedValue(undefined as any);

    mockGroupStore.allUserGroups.set([testGroup]);

    await TestBed.configureTestingModule({
      imports: [ManageGroupsComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { group: testGroup } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManageGroupsComponent);
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
      expect(query('manage-groups-title')?.textContent?.trim()).toBe(
        'Manage Groups'
      );
    });

    it('should render Save and Cancel buttons', () => {
      expect(query('manage-groups-save-button')).toBeTruthy();
      expect(query('manage-groups-cancel-button')).toBeTruthy();
    });
  });

  describe('form initialization', () => {
    it('should initialize form with the selected group data', async () => {
      await fixture.whenStable();
      expect(component.f['groupName'].value).toBe('Test Group');
    });

    it('should initialize groupHasExpenses to false when group has no expenses', async () => {
      await fixture.whenStable();
      expect(component.groupHasExpenses()).toBe(false);
    });

    it('should disable currency field when group has expenses', async () => {
      mockExpenseService.hasExpensesForGroup.mockResolvedValue(true);

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ManageGroupsComponent],
        providers: [
          provideNoopAnimations(),
          { provide: MAT_DIALOG_DATA, useValue: { group: testGroup } },
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: LoadingService, useValue: createMockLoadingService() },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: GroupService, useValue: mockGroupService },
          { provide: ExpenseService, useValue: mockExpenseService },
          { provide: DemoService, useValue: mockDemoService },
          { provide: MatDialog, useValue: mockDialog },
          { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(ManageGroupsComponent);
      const newComponent = newFixture.componentInstance;
      await newFixture.whenStable();

      expect(newComponent.f['currencyCode'].disabled).toBe(true);
    });
  });

  describe('onSubmit', () => {
    beforeEach(async () => {
      component.f['groupName'].setValue('Updated Group Name');
      component.f['groupName'].markAsDirty();
      await fixture.whenStable();
    });

    it('should call groupService.updateGroup on submit', async () => {
      await component.onSubmit();
      expect(mockGroupService.updateGroup).toHaveBeenCalled();
    });

    it('should close dialog with saved result on success', async () => {
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
      expect(mockGroupService.updateGroup).not.toHaveBeenCalled();
    });
  });

  describe('archiveGroup', () => {
    it('should open a confirmation dialog', () => {
      // ManageGroupsComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.archiveGroup();
      expect(dialogSpy).toHaveBeenCalled();
    });

    it('should block archive in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.archiveGroup();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });
  });

  describe('unarchiveGroup', () => {
    it('should call groupService.updateGroup with archived: false', async () => {
      await component.unarchiveGroup();
      expect(mockGroupService.updateGroup).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ archived: false })
      );
    });

    it('should close dialog with unarchived operation', async () => {
      await component.unarchiveGroup();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'unarchived',
      });
    });

    it('should block unarchive in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.unarchiveGroup();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockGroupService.updateGroup).not.toHaveBeenCalled();
    });
  });

  describe('deleteGroup', () => {
    it('should open a confirmation dialog', () => {
      // ManageGroupsComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.deleteGroup();
      expect(dialogSpy).toHaveBeenCalled();
    });

    it('should block delete in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.deleteGroup();

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });
  });
});
