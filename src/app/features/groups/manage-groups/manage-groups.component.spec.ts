import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OverlayContainer } from '@angular/cdk/overlay';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { Group } from '@models/group';
import { FirebaseError } from 'firebase/app';
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
  mockDocRef,
  mockGroup,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageGroupsComponent } from './manage-groups.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('ManageGroupsComponent', () => {
  let fixture: ComponentFixture<ManageGroupsComponent>;
  let component: ManageGroupsComponent;
  let el: HTMLElement;
  let mockDialogRef: ReturnType<typeof createMockDialogRef>;
  let mockGroupService: ReturnType<typeof createMockGroupService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseStore: ReturnType<typeof createMockExpenseStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;

  const testGroup = mockGroup({ id: 'group-1', name: 'Test Group' });

  beforeEach(async () => {
    mockDialogRef = createMockDialogRef();
    mockGroupService = createMockGroupService();
    mockDialog = createMockMatDialog();
    mockGroupStore = createMockGroupStore();
    mockExpenseStore = createMockExpenseStore();
    mockExpenseService = createMockExpenseService();
    mockSnackBar = createMockSnackBar();
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();

    vi.mocked(mockGroupService.updateGroup).mockResolvedValue(undefined as any);
    vi.mocked(mockGroupService.deleteGroup).mockResolvedValue(undefined as any);

    mockGroupStore.allUserGroups.set([testGroup]);

    await TestBed.configureTestingModule({
      imports: [ManageGroupsComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { group: testGroup } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: LoadingService, useValue: mockLoading },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: GroupService, useValue: mockGroupService },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: mockAnalytics },
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

  // ---- Coverage pass B -------------------------------------------------

  const secondGroup = mockGroup({
    id: 'group-2',
    name: 'Second Group',
    active: false,
    autoAddMembers: true,
    archived: true,
    currencyCode: 'EUR',
    currencySymbol: '€',
    ref: mockDocRef('groups/group-2'),
  });

  /** Answers the confirm dialog the component opens, and exposes its handler's completion. */
  function answerDialog(target: unknown, result: unknown) {
    let handled: Promise<void> = Promise.resolve();
    const open = vi.spyOn((target as any).dialog, 'open').mockReturnValue({
      afterClosed: () => ({
        subscribe: (cb: (r: unknown) => Promise<void>) => {
          handled = cb(result);
        },
      }),
    } as any);
    return { open, handled: () => handled };
  }

  /** A fresh dialog on its own mocks, for tests that need other groups or data. */
  async function mount(
    opts: {
      group?: Group | null;
      groups?: Group[];
      tourPreview?: { groups: Group[] };
      hasExpenses?: boolean;
    } = {}
  ) {
    const groupStore = createMockGroupStore();
    groupStore.allUserGroups.set(opts.groups ?? [testGroup]);
    const expenses = createMockExpenseService();
    expenses.checkGroupHasExpenses.mockResolvedValue(opts.hasExpenses ?? false);
    const loading = createMockLoadingService();
    const dialogRef = createMockDialogRef();
    const snack = createMockSnackBar();
    const analytics = createMockAnalyticsService();
    const groupService = createMockGroupService();
    const appDialog = createMockMatDialog();

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ManageGroupsComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            group: opts.group === undefined ? testGroup : opts.group,
            tourPreview: opts.tourPreview,
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatSnackBar, useValue: snack },
        { provide: LoadingService, useValue: loading },
        { provide: GroupStore, useValue: groupStore },
        { provide: GroupService, useValue: groupService },
        { provide: ExpenseService, useValue: expenses },
        { provide: ExpenseStore, useValue: createMockExpenseStore() },
        { provide: MatDialog, useValue: appDialog },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();

    const fx = TestBed.createComponent(ManageGroupsComponent);
    await fx.whenStable();
    fx.detectChanges();
    const root = fx.nativeElement as HTMLElement;
    return {
      fx,
      comp: fx.componentInstance as any,
      root,
      q: (id: string) =>
        root.querySelector(`[data-testid="${id}"]`) as HTMLElement | null,
      expenses,
      loading,
      dialogRef,
      snack,
      analytics,
      groupService,
      appDialog,
    };
  }

  describe('opening the dialog', () => {
    it('keeps the overlay on while loading and clears it once the group is loaded', () => {
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOn.mock.invocationCallOrder[0]).toBeLessThan(
        mockLoading.loadingOff.mock.invocationCallOrder[0]!
      );
    });

    it('asks whether the group has expenses by its id', () => {
      expect(mockExpenseService.checkGroupHasExpenses).toHaveBeenCalledWith(
        'group-1'
      );
    });

    it('tells a user who administers no group so, with only a Close button', async () => {
      const m = await mount({
        groups: [mockGroup({ id: 'group-9', userIsAdmin: false })],
      });

      expect(m.root.textContent).toContain(
        'You are not an admin of any groups.'
      );
      expect(m.q('manage-groups-close-button')).toBeTruthy();
      expect(m.q('manage-groups-save-button')).toBeNull();
      expect(m.q('manage-group-select')).toBeNull();
      expect(m.loading.loadingOff).toHaveBeenCalled();
    });

    it('does not load a group the user does not administer, even if it was passed in', async () => {
      const m = await mount({
        group: mockGroup({
          id: 'group-9',
          name: 'Not Mine',
          userIsAdmin: false,
        }),
        groups: [testGroup],
      });

      expect(m.comp.selectedGroup()).toBeNull();
      expect(m.q('manage-group-name-input')).toBeNull();
      expect(m.expenses.checkGroupHasExpenses).not.toHaveBeenCalled();
      expect(
        (m.q('manage-groups-save-button') as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it('shows just the group picker when opened without a group', async () => {
      const m = await mount({ group: null });

      expect(m.q('manage-group-select')).toBeTruthy();
      expect(m.q('manage-group-name-input')).toBeNull();
      expect(m.q('archive-group-button')).toBeNull();
      expect(m.q('delete-group-button')).toBeNull();
      expect(
        (m.q('manage-groups-save-button') as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it('loads the group with its archived state: Unarchive instead of Archive', async () => {
      const m = await mount({
        group: secondGroup,
        groups: [testGroup, secondGroup],
      });

      expect(m.q('unarchive-group-button')).toBeTruthy();
      expect(m.q('archive-group-button')).toBeNull();
      expect(m.comp.editGroupModel()).toEqual({
        groupName: 'Second Group',
        active: false,
        autoAddMembers: true,
        currencyCode: 'EUR',
      });
    });

    it('falls back to inactive, no auto-add and USD for a group missing those fields', async () => {
      const sparse = mockGroup({
        id: 'group-3',
        name: 'Sparse',
        ref: mockDocRef('groups/group-3'),
      });
      (sparse as any).active = undefined;
      (sparse as any).autoAddMembers = undefined;
      (sparse as any).currencyCode = undefined;
      const m = await mount({ group: sparse, groups: [sparse] });

      expect(m.comp.editGroupModel()).toEqual({
        groupName: 'Sparse',
        active: false,
        autoAddMembers: false,
        currencyCode: 'USD',
      });
    });

    it('locks the currency and says why when the group already has expenses', async () => {
      const m = await mount({ hasExpenses: true });

      expect(m.comp.editGroupForm.currencyCode().disabled()).toBe(true);
      expect(m.root.textContent).toContain(
        'Cannot be changed once expenses are added to the group'
      );
    });

    it('offers the currency change while the group has no expenses', () => {
      expect(el.textContent).toContain('Select the currency for this group');
    });
  });

  describe('choosing another group', () => {
    it('loads that group into the form and re-checks its expenses', async () => {
      const m = await mount({
        groups: [testGroup, secondGroup],
        hasExpenses: true,
      });
      m.expenses.checkGroupHasExpenses.mockClear();

      await m.comp.onSelectGroup(secondGroup.ref);
      m.fx.detectChanges();

      expect(m.comp.selectedGroup()).toBe(secondGroup);
      expect(m.comp.editGroupModel().groupName).toBe('Second Group');
      expect(m.expenses.checkGroupHasExpenses).toHaveBeenCalledWith('group-2');
      expect(m.q('unarchive-group-button')).toBeTruthy();
      expect((m.q('manage-group-name-input') as HTMLInputElement).value).toBe(
        'Second Group'
      );
    });

    it('drops the edit form when the selection is cleared', async () => {
      const m = await mount({ groups: [testGroup, secondGroup] });

      await m.comp.onSelectGroup(null);
      m.fx.detectChanges();

      expect(m.comp.selectedGroup()).toBeNull();
      expect(m.comp.groupRefValid()).toBe(false);
      expect(m.q('manage-group-name-input')).toBeNull();
    });

    it('treats a reference that is not one of the admin groups as no selection', async () => {
      const m = await mount();

      await m.comp.onSelectGroup(mockDocRef('groups/other'));
      m.fx.detectChanges();

      expect(m.comp.selectedGroup()).toBeNull();
      expect(m.q('manage-group-name-input')).toBeNull();
      expect(
        (m.q('manage-groups-save-button') as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it('switches groups from the dropdown', async () => {
      const m = await mount({ groups: [testGroup, secondGroup] });
      try {
        (
          m.root.querySelector('.mat-mdc-select-trigger') as HTMLElement
        ).click();
        // The panel renders in a later pass than one whenStable guarantees.
        let option: HTMLElement | null = null;
        await vi.waitFor(
          () => {
            m.fx.detectChanges();
            option = document.querySelector(
              '[data-testid="manage-group-option-group-2"]'
            );
            expect(option).not.toBeNull();
          },
          { timeout: 3000, interval: 20 }
        );
        (option as unknown as HTMLElement).click();
        m.fx.detectChanges();
        await m.fx.whenStable();
        m.fx.detectChanges();

        expect(m.comp.selectedGroup()).toBe(secondGroup);
        expect(
          (m.q('manage-group-name-input') as HTMLInputElement).value
        ).toBe('Second Group');
      } finally {
        m.fx.destroy();
        TestBed.inject(OverlayContainer).ngOnDestroy();
      }
      expect(document.querySelectorAll('.cdk-overlay-pane').length).toBe(0);
    });

    it('does not read Firestore when switching between the tour sample groups', async () => {
      const sampleA = mockGroup({
        id: 'tour-a',
        name: 'A',
        userIsAdmin: true,
        ref: mockDocRef('groups/tour-a'),
      });
      const sampleB = mockGroup({
        id: 'tour-b',
        name: 'B',
        userIsAdmin: true,
        ref: mockDocRef('groups/tour-b'),
      });
      const m = await mount({
        group: sampleA,
        groups: [],
        tourPreview: { groups: [sampleA, sampleB] },
      });

      await m.comp.onSelectGroup(sampleB.ref);

      expect(m.comp.editGroupModel().groupName).toBe('B');
      expect(m.comp.selectedGroupHasExpenses()).toBe(false);
      expect(m.expenses.checkGroupHasExpenses).not.toHaveBeenCalled();
    });
  });

  describe('editing', () => {
    const typeName = async (value: string) => {
      const input = query('manage-group-name-input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const saveButton = () =>
      query('manage-groups-save-button') as HTMLButtonElement;

    it('keeps Save disabled until something changes', () => {
      expect(saveButton().disabled).toBe(true);
    });

    it('enables Save for a change and disables it again when the change is undone', async () => {
      await typeName('Renamed');
      expect(saveButton().disabled).toBe(false);

      await typeName('Test Group');
      expect(saveButton().disabled).toBe(true);
    });

    it('requires a name: shows "*Required" and keeps Save disabled', async () => {
      await typeName('');

      expect(query('manage-group-name-error-0')?.textContent?.trim()).toBe(
        '*Required'
      );
      expect(saveButton().disabled).toBe(true);
    });

    it('saves the edited fields with the new currency symbol and decimal places', async () => {
      await typeName('Renamed');
      (
        query('manage-active-toggle')!.querySelector('button') as HTMLElement
      ).click();
      (
        query('manage-auto-add-toggle')!.querySelector('button') as HTMLElement
      ).click();
      (component as any).editGroupModel.update((m: any) => ({
        ...m,
        currencyCode: 'JPY',
      }));
      fixture.detectChanges();
      await fixture.whenStable();

      saveButton().click();
      await fixture.whenStable();

      expect(mockGroupService.updateGroup).toHaveBeenCalledWith(testGroup.ref, {
        name: 'Renamed',
        active: false,
        autoAddMembers: true,
        currencyCode: 'JPY',
        currencySymbol: '¥',
        decimalPlaces: 0,
      });
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'saved',
      });
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('shows an Error from the save, logs it, keeps the dialog open and clears the overlay', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce(
        new Error('A group with that name already exists')
      );

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'A group with that name already exists' } }
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Manage Groups Component',
        'edit_group',
        'A group with that name already exists'
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('shows a generic message when the save fails with something that is not an Error', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce('nope');

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Something went wrong - could not edit group' } }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('archiving', () => {
    it('asks first, with Archive wording, and changes nothing when declined', () => {
      const d = answerDialog(component, false);

      component.archiveGroup();

      expect(d.open).toHaveBeenCalledWith(expect.anything(), {
        data: expect.objectContaining({
          dialogTitle: 'Archive Group',
          confirmButtonText: 'Archive',
          cancelButtonText: 'Cancel',
        }),
      });
      expect(mockGroupService.updateGroup).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('archives and deactivates the group when confirmed, then closes the dialog', async () => {
      const d = answerDialog(component, true);

      component.archiveGroup();
      await d.handled();

      expect(mockGroupService.updateGroup).toHaveBeenCalledWith(testGroup.ref, {
        archived: true,
        active: false,
      });
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'archived',
      });
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('reports an Error from archiving and stays open', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce(
        new Error('Cannot archive')
      );
      const d = answerDialog(component, true);

      component.archiveGroup();
      await d.handled();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Cannot archive' } }
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Manage Groups Component',
        'archive_group',
        'Cannot archive'
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('shows a generic message when archiving fails with something that is not an Error', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce('nope');
      const d = answerDialog(component, true);

      component.archiveGroup();
      await d.handled();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Something went wrong - could not archive group' } }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('opens the confirm dialog from the Archive button', () => {
      const d = answerDialog(component, false);

      (query('archive-group-button') as HTMLButtonElement).click();

      expect(d.open).toHaveBeenCalledTimes(1);
    });
  });

  describe('unarchiving', () => {
    it('restores only the archived flag', async () => {
      await component.unarchiveGroup();

      expect(mockGroupService.updateGroup).toHaveBeenCalledWith(testGroup.ref, {
        archived: false,
      });
    });

    it('reports an Error and stays open', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce(
        new Error('Cannot unarchive')
      );

      await component.unarchiveGroup();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Cannot unarchive' } }
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Manage Groups Component',
        'unarchive_group',
        'Cannot unarchive'
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('shows a generic message when it fails with something that is not an Error', async () => {
      vi.mocked(mockGroupService.updateGroup).mockRejectedValueOnce('nope');

      await component.unarchiveGroup();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Something went wrong - could not unarchive group' } }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('is offered by the Unarchive button of an archived group', async () => {
      const m = await mount({ group: secondGroup, groups: [secondGroup] });

      m.q('unarchive-group-button')!.click();
      await m.fx.whenStable();

      expect(m.groupService.updateGroup).toHaveBeenCalledWith(secondGroup.ref, {
        archived: false,
      });
      expect(m.dialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'unarchived',
      });
    });
  });

  describe('deleting', () => {
    it('warns that everything goes with the group, and deletes nothing when declined', () => {
      const d = answerDialog(component, false);

      component.deleteGroup();

      expect(d.open).toHaveBeenCalledWith(expect.anything(), {
        data: expect.objectContaining({
          dialogTitle: 'Delete Group',
          confirmButtonText: 'Delete',
          confirmationText: expect.stringContaining(
            'This action cannot be undone.'
          ),
        }),
      });
      expect(mockGroupService.deleteGroup).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('deletes the group by id when confirmed, then closes the dialog', async () => {
      const d = answerDialog(component, true);

      component.deleteGroup();
      await d.handled();

      expect(mockGroupService.deleteGroup).toHaveBeenCalledWith('group-1');
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        success: true,
        operation: 'deleted',
      });
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('opens the confirm dialog from the Delete button', () => {
      const d = answerDialog(component, false);

      (query('delete-group-button') as HTMLButtonElement).click();

      expect(d.open).toHaveBeenCalledTimes(1);
    });

    it('shows an Error from the delete, logs it, and stays open', async () => {
      vi.mocked(mockGroupService.deleteGroup).mockRejectedValueOnce(
        new Error('Delete failed')
      );
      const d = answerDialog(component, true);

      component.deleteGroup();
      await d.handled();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Delete failed' } }
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Manage Groups Component',
        'delete_group',
        'Delete failed'
      );
      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff.mock.calls.length).toBe(
        mockLoading.loadingOn.mock.calls.length
      );
    });

    it('shows a generic message, without logging, when the delete fails with something that is not an Error', async () => {
      vi.mocked(mockGroupService.deleteGroup).mockRejectedValueOnce('nope');
      const d = answerDialog(component, true);

      component.deleteGroup();
      await d.handled();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Something went wrong - could not delete group' } }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('opens the App Check dialog instead of a snackbar when the delete is refused as permission-denied', async () => {
      vi.mocked(mockGroupService.deleteGroup).mockRejectedValueOnce(
        new FirebaseError(
          'permission-denied',
          'Missing or insufficient permissions.'
        )
      );
      const d = answerDialog(component, true);

      component.deleteGroup();
      await d.handled();

      expect(mockDialog.open).toHaveBeenCalledWith(
        AppCheckErrorDialogComponent,
        { disableClose: false, maxWidth: '80vw' }
      );
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });
  });

  it("should end the form's Enter order on Save", () => {
    expectEnterEndsOnSave(fixture);
  });
});
