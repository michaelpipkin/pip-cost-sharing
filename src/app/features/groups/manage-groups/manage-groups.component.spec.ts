import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { ExpenseService } from '@services/expense.service';
import { GroupService } from '@services/group.service';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import {
  createMockAnalyticsService,
  createMockDialogRef,
  createMockExpenseService,
  createMockExpenseStore,
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
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseStore: ReturnType<typeof createMockExpenseStore>;

  const testGroup = mockGroup({ id: 'group-1', name: 'Test Group' });

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockGroupService = createMockGroupService();
    mockDialog = createMockMatDialog();
    mockGroupStore = createMockGroupStore();
    mockExpenseStore = createMockExpenseStore();

    vi.mocked(mockGroupService.updateGroup).mockResolvedValue(undefined as any);
    vi.mocked(mockGroupService.deleteGroup).mockResolvedValue(undefined as any);

    mockGroupStore.allUserGroups.set([testGroup]);

    await TestBed.configureTestingModule({
      imports: [ManageGroupsComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { group: testGroup } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: ExpenseService, useValue: createMockExpenseService() },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManageGroupsComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
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
    it('should initialize form with the selected group data', () => {
      const input = el.querySelector(
        '[data-testid="manage-group-name-input"]'
      ) as HTMLInputElement;
      expect(input?.value).toBe('Test Group');
    });

    it('should initialize with currency field enabled when group has no expenses', () => {
      expect(mockExpenseStore.groupHasExpenses()).toBe(false);
      expect(
        (component as any).editGroupForm.currencyCode().disabled()
      ).toBe(false);
    });

    it('should disable currency field when group has expenses', async () => {
      const mockExpenseStoreWithExpenses = createMockExpenseStore();
      mockExpenseStoreWithExpenses.setGroupHasExpenses(true);
      const mockExpenseServiceWithExpenses = createMockExpenseService();
      mockExpenseServiceWithExpenses.checkGroupHasExpenses.mockResolvedValue(true);

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ManageGroupsComponent],
        providers: [
          { provide: MAT_DIALOG_DATA, useValue: { group: testGroup } },
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: LoadingService, useValue: createMockLoadingService() },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: GroupService, useValue: mockGroupService },
          { provide: ExpenseService, useValue: mockExpenseServiceWithExpenses },
          {
            provide: ExpenseStore,
            useValue: mockExpenseStoreWithExpenses,
          },
          { provide: MatDialog, useValue: mockDialog },
          {
            provide: AnalyticsService,
            useValue: createMockAnalyticsService(),
          },
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(ManageGroupsComponent);
      await newFixture.whenStable();
      newFixture.detectChanges();

      expect(
        (newFixture.componentInstance as any).editGroupForm
          .currencyCode()
          .disabled()
      ).toBe(true);
    });
  });

  describe('onSubmit', () => {
    beforeEach(() => {
      fixture.detectChanges();
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
  });
  describe('guided tour preview', () => {
    it('should list the sample groups without reading Firestore', async () => {
      const sample = mockGroup({
        id: 'tour-sample-beach',
        name: 'Beach Weekend',
        userIsAdmin: true,
      });
      const expenseService = createMockExpenseService();
      mockGroupStore.allUserGroups.set([]);

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ManageGroupsComponent],
        providers: [
          {
            provide: MAT_DIALOG_DATA,
            useValue: { group: sample, tourPreview: { groups: [sample] } },
          },
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: LoadingService, useValue: createMockLoadingService() },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: GroupService, useValue: mockGroupService },
          { provide: ExpenseService, useValue: expenseService },
          { provide: ExpenseStore, useValue: mockExpenseStore },
          { provide: MatDialog, useValue: mockDialog },
          {
            provide: AnalyticsService,
            useValue: createMockAnalyticsService(),
          },
        ],
      }).compileComponents();

      const previewFixture = TestBed.createComponent(ManageGroupsComponent);
      await previewFixture.whenStable();
      previewFixture.detectChanges();
      const preview = previewFixture.componentInstance as any;

      expect(preview.userAdminGroups()).toEqual([sample]);
      expect(preview.editGroupModel().groupName).toBe('Beach Weekend');
      expect(expenseService.checkGroupHasExpenses).not.toHaveBeenCalled();
    });
  });
});
