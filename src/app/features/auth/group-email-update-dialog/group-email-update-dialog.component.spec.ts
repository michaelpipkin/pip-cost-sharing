import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { MemberService } from '@services/member.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
  createMockUserStore,
  mockDocRef,
  mockUser,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GroupEmailUpdateDialogComponent,
  GroupEmailUpdateDialogData,
} from './group-email-update-dialog.component';

const OLD = 'old@test.com';
const NEW = 'new@test.com';

describe('GroupEmailUpdateDialogComponent', () => {
  let fixture: ComponentFixture<GroupEmailUpdateDialogComponent>;
  let el: HTMLElement;
  let tokenClaims: Record<string, unknown>;
  const mockAuth = {
    currentUser: {
      getIdTokenResult: vi.fn(async () => ({ claims: tokenClaims })),
    },
  };
  const mockMemberService = { updateAllMemberEmails: vi.fn() };
  const mockDialogRef = { close: vi.fn() };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let userStore: ReturnType<typeof createMockUserStore>;
  const userRef = mockDocRef('users/u1');

  async function open(total: number, onOldEmail: number): Promise<void> {
    const data: GroupEmailUpdateDialogData = {
      oldEmail: OLD,
      newEmail: NEW,
      total,
      onOldEmail,
    };
    TestBed.configureTestingModule({
      imports: [GroupEmailUpdateDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: authModule.getAuth, useValue: mockAuth },
        { provide: MemberService, useValue: mockMemberService },
        { provide: UserStore, useValue: userStore },
        { provide: LoadingService, useValue: mockLoading },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    fixture = TestBed.createComponent(GroupEmailUpdateDialogComponent);
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  const query = (testId: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const text = (testId: string) =>
    query(testId)?.textContent?.replace(/\s+/g, ' ').trim();
  const snackbarMessage = () =>
    mockSnackBar.openFromComponent.mock.calls.at(-1)?.[1]?.data?.message;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenClaims = { email: NEW, email_verified: true };
    mockSnackBar = createMockSnackBar();
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();
    userStore = createMockUserStore();
    userStore.user.set(mockUser({ ref: userRef as any }));
    mockMemberService.updateAllMemberEmails.mockResolvedValue(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copy', () => {
    it('asks the question and says what the new login email means', async () => {
      await open(3, 2);

      expect(text('group-email-update-title')).toBe('Update your group emails?');
      expect(text('group-email-update-intro')).toBe(
        `Your login email is now ${NEW}. Group emails, such as payment requests, go to the address on each group membership.`
      );
      expect(text('group-email-update-later-note')).toBe(
        'You can also update all of them later from Account > Profile.'
      );
    });

    it('with some memberships on the old email and some elsewhere (0 < M < N), describes both kinds and both options', async () => {
      await open(3, 2);

      expect(text('group-email-update-old-line')).toBe(
        `2 memberships still use your old login email, ${OLD}.`
      );
      expect(text('group-email-update-other-line')).toBe(
        '1 membership uses a different address you set for that group.'
      );
      expect(text('group-email-update-all-help')).toBe(
        `Update all: Every membership switches to ${NEW}.`
      );
      expect(text('group-email-update-old-only-help')).toBe(
        `Update old email only: Only memberships using ${OLD} switch; addresses you set for a group are kept.`
      );
    });

    it('uses the singular for a count of one and the plural otherwise', async () => {
      await open(3, 1);

      expect(text('group-email-update-old-line')).toBe(
        `1 membership still uses your old login email, ${OLD}.`
      );
      expect(text('group-email-update-other-line')).toBe(
        '2 memberships use a different address you set for that group.'
      );
    });

    it('with none on the old email (M = 0), shows only the different-address line and the Update all description', async () => {
      await open(2, 0);

      expect(query('group-email-update-old-line')).toBeNull();
      expect(text('group-email-update-other-line')).toBe(
        '2 memberships use a different address you set for that group.'
      );
      expect(text('group-email-update-all-help')).toContain('Update all:');
      expect(query('group-email-update-old-only-help')).toBeNull();
    });

    it('with all on the old email (M = N), shows only the old-email line and the Update all description', async () => {
      await open(2, 2);

      expect(text('group-email-update-old-line')).toBe(
        `2 memberships still use your old login email, ${OLD}.`
      );
      expect(query('group-email-update-other-line')).toBeNull();
      expect(text('group-email-update-all-help')).toContain('Update all:');
      expect(query('group-email-update-old-only-help')).toBeNull();
    });
  });

  describe('buttons', () => {
    it('shows Not now, Update old email only and Update all when 0 < M < N', async () => {
      await open(3, 1);

      expect(text('group-email-update-not-now-button')).toBe('Not now');
      expect(text('group-email-update-old-only-button')).toBe(
        'Update old email only'
      );
      expect(text('group-email-update-all-button')).toBe('Update all');
    });

    it.each([
      ['M = 0', 2, 0],
      ['M = N', 2, 2],
    ])('hides Update old email only when %s', async (_label, total, onOld) => {
      await open(total, onOld);

      expect(query('group-email-update-old-only-button')).toBeNull();
      expect(query('group-email-update-not-now-button')).not.toBeNull();
      expect(query('group-email-update-all-button')).not.toBeNull();
    });

    it('closes without updating on Not now', async () => {
      await open(3, 1);

      const close = fixture.debugElement
        .query(By.css('[data-testid="group-email-update-not-now-button"]'))
        .injector.get(MatDialogClose, null);
      expect(close).not.toBeNull();
      expect(mockMemberService.updateAllMemberEmails).not.toHaveBeenCalled();
    });
  });

  describe('Update all', () => {
    beforeEach(async () => {
      await open(3, 1);
    });

    it('updates every membership to the verified token email, behind the loading overlay', async () => {
      await fixture.componentInstance.updateAll();

      expect(mockAuth.currentUser.getIdTokenResult).toHaveBeenCalledWith(true);
      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
        userRef,
        NEW
      );
      expect(mockLoading.loadingOn).toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('is what the Update all button calls', async () => {
      fixture.debugElement
        .query(By.css('[data-testid="group-email-update-all-button"]'))
        .nativeElement.click();

      await vi.waitFor(() =>
        expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
          userRef,
          NEW
        )
      );
    });

    it('writes the token address even if it differs from the one the dialog was opened with', async () => {
      tokenClaims = { email: 'changed-again@test.com', email_verified: true };

      await fixture.componentInstance.updateAll();

      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
        userRef,
        'changed-again@test.com'
      );
    });

    it.each([
      [1, 'Updated email on 1 member record'],
      [2, 'Updated email on 2 member records'],
      [0, 'No member records needed updating'],
    ])('reports %s updated record(s)', async (count, message) => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue(count);

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(message);
    });

    it('asks for verification, writing nothing, when the token email is not verified', async () => {
      tokenClaims = { email: NEW, email_verified: false };

      await fixture.componentInstance.updateAll();

      expect(mockMemberService.updateAllMemberEmails).not.toHaveBeenCalled();
      expect(snackbarMessage()).toBe('Verify your login email first.');
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('shows an error snackbar, logs it and closes when the update fails', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        new Error('permission-denied')
      );

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(
        'Something went wrong - could not update member emails'
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Group Email Update Dialog',
        'update_all',
        'Failed to update member emails',
        'permission-denied'
      );
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });
  });

  describe('Update old email only', () => {
    beforeEach(async () => {
      await open(3, 1);
    });

    it('passes the old login email as onlyFromEmail', async () => {
      await fixture.componentInstance.updateOldOnly();

      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
        userRef,
        NEW,
        OLD
      );
      expect(snackbarMessage()).toBe('Updated email on 2 member records');
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('is what the Update old email only button calls', async () => {
      fixture.debugElement
        .query(By.css('[data-testid="group-email-update-old-only-button"]'))
        .nativeElement.click();

      await vi.waitFor(() =>
        expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
          userRef,
          NEW,
          OLD
        )
      );
    });

    it('shows an error snackbar and logs it when the update fails', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue('boom');

      await fixture.componentInstance.updateOldOnly();

      expect(snackbarMessage()).toBe(
        'Something went wrong - could not update member emails'
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Group Email Update Dialog',
        'update_old_email_only',
        'Failed to update member emails',
        'Unknown error'
      );
    });
  });
});
