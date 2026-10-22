import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { GroupStore } from '@store/group.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockGroupStore,
  createMockLoadingService,
  createMockUserStore,
  mockDocRef,
  mockGroup,
  mockUser,
} from '@testing/test-helpers';
import { disposeOverlays } from '@testing/overlay-testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPreferencesComponent } from './account-preferences.component';

describe('AccountPreferencesComponent', () => {
  let fixture: ComponentFixture<AccountPreferencesComponent>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };
  let mockUserService: { updateUser: ReturnType<typeof vi.fn> };

  const refA = mockDocRef('groups/group-a');
  const refB = mockDocRef('groups/group-b');

  async function createComponent(defaultGroupRef: any = refA): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser({ defaultGroupRef }));
    mockGroupStore = createMockGroupStore();
    mockGroupStore.allUserGroups.set([
      mockGroup({ id: 'group-a', name: 'Group A', ref: refA }),
      mockGroup({ id: 'group-b', name: 'Group B', ref: refB }),
      mockGroup({
        id: 'group-c',
        name: 'Group C',
        ref: mockDocRef('groups/group-c'),
        archived: true,
      }),
    ]);
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();
    mockSnackbar = { openFromComponent: vi.fn() };
    mockUserService = { updateUser: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [AccountPreferencesComponent],
      providers: [
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: UserService, useValue: mockUserService },
        { provide: LoadingService, useValue: mockLoading },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountPreferencesComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function select(): MatSelect {
    return fixture.debugElement.query(By.directive(MatSelect))
      .componentInstance as MatSelect;
  }

  function saveButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="save-preferences-button"]'
    ) as HTMLButtonElement;
  }

  // The options of the opened panel. They render in the first pass after
  // open(). When they are missing, a stale popover stub from an earlier spec
  // is the usual cause (the panel then renders inline, outside the overlay
  // container); src/testing/popover-guard-setup.ts names the leaking test.
  async function openOptions(): Promise<HTMLElement[]> {
    fixture.detectChanges();
    await fixture.whenStable();
    const options = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.cdk-overlay-container mat-option'
      )
    );
    expect(
      options.length,
      'mat-options in the overlay container'
    ).toBeGreaterThan(0);
    return options;
  }

  async function choose(optionText: string): Promise<void> {
    (
      fixture.nativeElement.querySelector(
        '.mat-mdc-select-trigger'
      ) as HTMLElement
    ).click();
    const options = await openOptions();
    const option = options.find((o) => o.textContent?.trim() === optionText);
    expect(option, `option "${optionText}"`).toBeDefined();
    option!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function messages(): string[] {
    return mockSnackbar.openFromComponent.mock.calls.map(
      (c) => c[1].data.message
    );
  }

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    disposeOverlays();
    TestBed.resetTestingModule();
  });

  describe('seeding', () => {
    it('should select the default group from the user', async () => {
      await createComponent(refA);
      expect(select().value).toBe(refA);
      expect(select().triggerValue).toBe('Group A');
    });

    it('should select None when the user has no default group', async () => {
      await createComponent(null);
      expect(select().value).toBeNull();
    });

    it('should list None and the active groups, not archived ones', async () => {
      await createComponent();
      select().open();
      const texts = (await openOptions()).map((o) => o.textContent?.trim());
      expect(texts).toEqual(['-- None --', 'Group A', 'Group B']);
    });

    it('should re-seed the selection and clear the dirty state when the user changes', async () => {
      await createComponent(refA);
      await choose('Group B');
      expect(saveButton().disabled).toBe(false);

      mockUserStore.user.set(mockUser({ defaultGroupRef: refB }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(select().value).toBe(refB);
      expect(saveButton().disabled).toBe(true);
    });
  });

  describe('save', () => {
    it('should keep Save disabled until a selection changes', async () => {
      await createComponent();
      expect(saveButton().disabled).toBe(true);

      await choose('Group B');

      expect(saveButton().disabled).toBe(false);
    });

    it('should send the chosen group ref and show the snackbar', async () => {
      await createComponent(refA);
      await choose('Group B');

      saveButton().click();
      await fixture.whenStable();

      expect(mockUserService.updateUser).toHaveBeenCalledTimes(1);
      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        defaultGroupRef: refB,
      });
      expect(messages()).toEqual(['Default group updated']);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('should send null when None is chosen', async () => {
      await createComponent(refA);
      await choose('-- None --');

      saveButton().click();
      await fixture.whenStable();

      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        defaultGroupRef: null,
      });
      expect(messages()).toEqual(['Default group updated']);
    });

    it('should pair loadingOn and loadingOff, turning off only after the save settles', async () => {
      await createComponent();
      let resolveSave!: () => void;
      mockUserService.updateUser.mockReturnValue(
        new Promise<void>((resolve) => (resolveSave = resolve))
      );

      const done = (fixture.componentInstance as any).onSubmitGroup();
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).not.toHaveBeenCalled();

      resolveSave();
      await done;
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should show the Error message, log it and turn loading off when the save fails', async () => {
      await createComponent();
      mockUserService.updateUser.mockRejectedValue(
        new Error('Permission denied')
      );
      await choose('Group B');

      saveButton().click();
      await fixture.whenStable();

      expect(messages()).toEqual(['Permission denied']);
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Preferences Component',
        'update_default_group',
        'Permission denied'
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should show the generic message for a non-Error rejection and not log it', async () => {
      await createComponent();
      mockUserService.updateUser.mockRejectedValue('boom');

      await (fixture.componentInstance as any).onSubmitGroup();

      expect(messages()).toEqual([
        'Something went wrong - could not update default group',
      ]);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });
  });
});
