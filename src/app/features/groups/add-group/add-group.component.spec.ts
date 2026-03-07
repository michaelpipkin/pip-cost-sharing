import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SUPPORTED_CURRENCIES } from '@models/currency-config.interface';
import { AddGroupComponent } from './add-group.component';
import { GroupService } from '@services/group.service';
import { DemoService } from '@services/demo.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import { UserStore } from '@store/user.store';
import {
  createMockUserStore,
  createMockLoadingService,
  createMockDemoService,
  createMockGroupService,
  createMockAnalyticsService,
  createMockSnackBar,
  createMockDialogRef,
  mockUser,
} from '@testing/test-helpers';

describe('AddGroupComponent', () => {
  let fixture: ComponentFixture<AddGroupComponent>;
  let component: AddGroupComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    const mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser());

    await TestBed.configureTestingModule({
      imports: [AddGroupComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MatDialogRef, useValue: createMockDialogRef() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: UserStore, useValue: mockUserStore },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: DemoService, useValue: createMockDemoService() },
        { provide: GroupService, useValue: createMockGroupService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddGroupComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
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
    it('should default currency to USD', () => {
      expect(component.newGroupForm.value.currencyCode).toBe('USD');
    });

    it('should populate supportedCurrencies from model', () => {
      expect(component.supportedCurrencies).toBe(SUPPORTED_CURRENCIES);
      expect(component.supportedCurrencies.length).toBe(20);
    });
  });

  describe('form validation', () => {
    it('should disable Save when group name is empty', async () => {
      component.newGroupForm.controls.groupName.setValue('');
      component.newGroupForm.controls.displayName.setValue('Alice');
      await fixture.whenStable();

      const saveBtn = query('add-group-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should disable Save when display name is empty', async () => {
      component.newGroupForm.controls.groupName.setValue('My Group');
      component.newGroupForm.controls.displayName.setValue('');
      await fixture.whenStable();

      const saveBtn = query('add-group-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable Save when all required fields are filled', async () => {
      component.newGroupForm.controls.groupName.setValue('My Group');
      component.newGroupForm.controls.displayName.setValue('Alice');
      await fixture.whenStable();

      const saveBtn = query('add-group-save-button') as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
  });
});
