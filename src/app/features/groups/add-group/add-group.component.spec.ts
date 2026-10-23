import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { SUPPORTED_CURRENCIES } from '@models/currency-config.interface';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockDialogRef,
  createMockGroupService,
  createMockLoadingService,
  createMockSnackBar,
  createMockUserStore,
  mockUser,
} from '@testing/test-helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddGroupComponent } from './add-group.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('AddGroupComponent', () => {
  let fixture: ComponentFixture<AddGroupComponent>;
  let component: AddGroupComponent;
  let el: HTMLElement;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockGroupService: ReturnType<typeof createMockGroupService>;

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser());
    mockGroupService = createMockGroupService();

    await TestBed.configureTestingModule({
      imports: [AddGroupComponent],
      providers: [
        { provide: MatDialogRef, useValue: createMockDialogRef() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: GroupService, useValue: mockGroupService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddGroupComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function setInputValue(testId: string, value: string): void {
    const input = el.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  describe('initial render', () => {
    it('should render dialog title', () => {
      expect(query('add-group-title')?.textContent?.trim()).toBe(
        'Add New Group'
      );
    });

    it('should render group name input', () => {
      expect(query('group-name-input')).toBeTruthy();
    });

    it('should render display name input', () => {
      expect(query('display-name-input')).toBeTruthy();
    });

    it('should render currency select', () => {
      expect(query('currency-select')).toBeTruthy();
    });

    it('should render auto-add-members toggle', () => {
      expect(query('auto-add-members-toggle')).toBeTruthy();
    });

    it('should render Save and Cancel buttons', () => {
      expect(query('add-group-save-button')).toBeTruthy();
      expect(query('add-group-cancel-button')).toBeTruthy();
    });
  });

  describe('form defaults', () => {
    it('should populate supportedCurrencies from model', () => {
      expect(component.supportedCurrencies).toBe(SUPPORTED_CURRENCIES);
      expect(component.supportedCurrencies.length).toBe(20);
    });

    it('should enable Save with default currency when name fields are provided', async () => {
      setInputValue('group-name-input', 'My Group');
      setInputValue('display-name-input', 'Alice');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('add-group-save-button') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('form validation', () => {
    it('should disable Save when group name is empty', async () => {
      setInputValue('display-name-input', 'Alice');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('add-group-save-button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('should disable Save when display name is empty', async () => {
      setInputValue('group-name-input', 'My Group');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('add-group-save-button') as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable Save when all required fields are filled', async () => {
      setInputValue('group-name-input', 'My Group');
      setInputValue('display-name-input', 'Alice');
      await fixture.whenStable();
      fixture.detectChanges();
      expect((query('add-group-save-button') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('onSubmit: the creator member email', () => {
    async function submitAs(email: string) {
      mockUserStore.user.set(mockUser({ email }));
      mockGroupService.addGroup.mockResolvedValue(undefined);
      setInputValue('group-name-input', 'Trip');
      setInputValue('display-name-input', 'Me');
      await fixture.whenStable();
      await component.onSubmit();
      expect(mockGroupService.addGroup).toHaveBeenCalledTimes(1);
      return mockGroupService.addGroup.mock.calls[0]![1];
    }

    it('copies a valid stored email onto the creator member', async () => {
      const member = await submitAs('me+trip@example.co.uk');
      expect(member.email).toBe('me+trip@example.co.uk');
    });

    // A legacy stored email that fails the single-address rule would make
    // the member create fail the Firestore rules (R7), so it is left blank.
    it.each(['a@b', 'a@x.com,b@y.com'])(
      'writes an empty creator email when the stored email is %s',
      async (email) => {
        const member = await submitAs(email);
        expect(member.email).toBe('');
      }
    );
  });

  it("should end the form's Enter order on Save", () => {
    expectEnterEndsOnSave(fixture);
  });
});
