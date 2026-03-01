import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import * as functionsModule from 'firebase/functions';
import { DeleteAccountComponent } from './delete-account.component';
import { UserService } from '@services/user.service';
import { GroupService } from '@services/group.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockLoadingService,
  createMockGroupService,
  createMockAnalyticsService,
  createMockSnackBar,
} from '@testing/test-helpers';

describe('DeleteAccountComponent', () => {
  let fixture: ComponentFixture<DeleteAccountComponent>;
  let component: DeleteAccountComponent;
  let mockUserService: { logout: ReturnType<typeof vi.fn>; updateUser: ReturnType<typeof vi.fn> };

  const mockAuthWithUser = {
    currentUser: {
      email: 'test@example.com',
      emailVerified: true,
      reload: vi.fn().mockResolvedValue(undefined),
    },
  };

  const mockAuthWithoutUser = {
    currentUser: null,
  };

  async function createComponent(authValue: any) {
    mockUserService = {
      logout: vi.fn().mockResolvedValue(undefined),
      updateUser: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [DeleteAccountComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: getAuth, useValue: authValue },
        { provide: getFunctions, useValue: {} },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserService, useValue: mockUserService },
        { provide: GroupService, useValue: createMockGroupService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteAccountComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('when user is not logged in (unverified state)', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser);
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should start in unverified state', () => {
      expect(component.state()).toBe('unverified');
    });

    it('should start with empty verifiedEmail', () => {
      expect(component.verifiedEmail()).toBe('');
    });

    it('should start with confirmDeletion false', () => {
      expect(component.confirmDeletion()).toBe(false);
    });
  });

  describe('when user is logged in (verified state)', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithUser);
    });

    it('should start in verified state', () => {
      expect(component.state()).toBe('verified');
    });

    it('should have user email in verifiedEmail signal', () => {
      expect(component.verifiedEmail()).toBe('test@example.com');
    });

    it('should start with confirmDeletion false', () => {
      expect(component.confirmDeletion()).toBe(false);
    });

    describe('deleteAccount', () => {
      it('should show snackbar when confirmDeletion is false', async () => {
        const mockSnackBar = TestBed.inject(MatSnackBar) as any;
        component.confirmDeletion.set(false);

        await component.deleteAccount();

        expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
        // Should not proceed with deletion
        expect(component.state()).toBe('verified');
      });

      it('should call cloud function and transition to completed state on success', async () => {
        const mockCallable = vi.fn().mockResolvedValue({ data: { success: true } });
        vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(mockCallable);

        component.confirmDeletion.set(true);
        await component.deleteAccount();

        expect(component.state()).toBe('completed');
        expect(mockUserService.logout).toHaveBeenCalledWith(false);
      });

      it('should remain in verified state when cloud function returns success: false', async () => {
        const mockCallable = vi.fn().mockResolvedValue({ data: { success: false } });
        vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(mockCallable);

        component.confirmDeletion.set(true);
        await component.deleteAccount();

        expect(component.state()).toBe('verified');
      });
    });
  });
});
