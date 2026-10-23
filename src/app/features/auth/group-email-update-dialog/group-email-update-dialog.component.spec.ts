import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { MemberService } from '@services/member.service';
import { UserStore } from '@store/user.store';
import {
  createMockLoadingService,
  createMockSnackBar,
  createMockUserStore,
  mockDocRef,
  mockUser,
} from '@testing/test-helpers';
import { FirebaseError } from 'firebase/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GroupEmailUpdateDialogComponent,
  GroupEmailUpdateDialogData,
} from './group-email-update-dialog.component';

const OLD = 'old@test.com';
const NEW = 'new@test.com';
const INVALID_LOGIN_EMAIL_MESSAGE =
  "Your login email is not a single valid email address, so it can't be used as a group email. Change your login email first.";

describe('GroupEmailUpdateDialogComponent', () => {
  let fixture: ComponentFixture<GroupEmailUpdateDialogComponent>;
  let el: HTMLElement;
  const mockMemberService = { updateAllMemberEmails: vi.fn() };
  const mockDialogRef = { close: vi.fn() };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let userStore: ReturnType<typeof createMockUserStore>;
  /** The callable's refusal of an unverified login email, as the SDK throws it. */
  const unverifiedRefusal = () =>
    Object.assign(new Error('Verify your login email first. [403]'), {
      code: 'functions/permission-denied',
    });
  const userRef = mockDocRef('users/u1');

  async function open(
    total: number,
    onOldEmail: number,
    blank = 0
  ): Promise<void> {
    const data: GroupEmailUpdateDialogData = {
      oldEmail: OLD,
      newEmail: NEW,
      total,
      onOldEmail,
      blank,
    };
    TestBed.configureTestingModule({
      imports: [GroupEmailUpdateDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MemberService, useValue: mockMemberService },
        { provide: UserStore, useValue: userStore },
        { provide: LoadingService, useValue: mockLoading },
        { provide: MatSnackBar, useValue: mockSnackBar },
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
    mockSnackBar = createMockSnackBar();
    mockLoading = createMockLoadingService();
    userStore = createMockUserStore();
    userStore.user.set(mockUser({ ref: userRef as any }));
    mockMemberService.updateAllMemberEmails.mockResolvedValue({
      updated: 2,
      conflicts: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copy', () => {
    it('asks the question and says what the new login email means', async () => {
      await open(3, 2);

      // Untrimmed: a leading space shows as an indent after Material's
      // inline-block title ::before.
      expect(query('group-email-update-title')?.textContent).toBe(
        'Update your group emails?'
      );
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

  describe('memberships with no email address', () => {
    it('counts them on their own line, not as an address the user set for the group', async () => {
      // 4 differ: 1 old, 1 custom, 2 blank
      await open(4, 1, 2);

      expect(text('group-email-update-old-line')).toBe(
        `1 membership still uses your old login email, ${OLD}.`
      );
      expect(text('group-email-update-other-line')).toBe(
        '1 membership uses a different address you set for that group.'
      );
      expect(text('group-email-update-blank-line')).toBe(
        '2 memberships have no email address.'
      );
    });

    it('uses the singular for one blank membership', async () => {
      await open(2, 1, 1);

      expect(text('group-email-update-blank-line')).toBe(
        '1 membership has no email address.'
      );
    });

    it('omits the different-address line when every other membership is blank', async () => {
      await open(3, 1, 2);

      expect(query('group-email-update-other-line')).toBeNull();
      expect(text('group-email-update-blank-line')).toBe(
        '2 memberships have no email address.'
      );
    });

    it('shows no blank line when none are blank', async () => {
      await open(3, 2);

      expect(query('group-email-update-blank-line')).toBeNull();
    });

    it('with only blank memberships, offers just Update all', async () => {
      await open(2, 0, 2);

      expect(query('group-email-update-old-line')).toBeNull();
      expect(query('group-email-update-other-line')).toBeNull();
      expect(query('group-email-update-old-only-button')).toBeNull();
      expect(query('group-email-update-all-button')).not.toBeNull();
    });

    it('still offers Update old email only when 0 < M < N because of blank rows', async () => {
      await open(3, 1, 2);

      expect(query('group-email-update-old-only-button')).not.toBeNull();
    });

    it('hides Update old email only when every non-blank membership is on the old email and none are blank (M = N)', async () => {
      await open(2, 2, 0);

      expect(query('group-email-update-old-only-button')).toBeNull();
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

      query('group-email-update-not-now-button')!.click();

      expect(mockDialogRef.close).toHaveBeenCalledTimes(1);
      expect(mockMemberService.updateAllMemberEmails).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });
  });

  describe('Update all', () => {
    beforeEach(async () => {
      await open(3, 1);
    });

    it('asks the server to update every membership, behind the loading overlay', async () => {
      await fixture.componentInstance.updateAll();

      // The server takes the address from the Auth account (M1/M2): the
      // dialog names none, and no onlyFromEmail.
      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
        undefined
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
          undefined
        )
      );
    });

    it.each([
      [{ updated: 1, conflicts: 0 }, 'Updated email on 1 member record'],
      [{ updated: 2, conflicts: 0 }, 'Updated email on 2 member records'],
      [{ updated: 0, conflicts: 0 }, 'No member records needed updating'],
      [
        { updated: 2, conflicts: 1 },
        'Updated email on 2 member records. 1 skipped because another member of that group already uses that address.',
      ],
      [
        { updated: 1, conflicts: 2 },
        'Updated email on 1 member record. 2 skipped because another member of each of those groups already uses that address.',
      ],
    ])('reports %o', async (result, message) => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue(result);

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(message);
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('asks for verification and closes when the server refuses an unverified login email', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        unverifiedRefusal()
      );

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe('Verify your login email first.');
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    // T3: a failed Auth lookup is an outage; a retry can succeed, so the
    // dialog stays open with the same choice.
    it('asks to try again, and stays open, when the server could not check the account', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        Object.assign(
          new Error(
            "Couldn't check your account right now. Please try again. [503]"
          ),
          { code: 'functions/unavailable' }
        )
      );

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(
        "Couldn't check your account right now. Please try again."
      );
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    // Fix round 1, Minor 1: a retry can't succeed, so the dialog closes.
    it('explains, and closes, when the server refuses a login email that is not one valid address', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        Object.assign(
          new Error(
            'Your login email is not a single valid email address. [400]'
          ),
          { code: 'functions/failed-precondition' }
        )
      );

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(INVALID_LOGIN_EMAIL_MESSAGE);
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('shows an error snackbar and stays open for a retry when the update fails', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValueOnce(
        Object.assign(new Error('internal'), { code: 'functions/internal' })
      );

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe(
        'Something went wrong - could not update member emails'
      );
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      // Stays open so the user can retry the same choice (the callable is
      // all or nothing, so the retry starts from scratch).
      expect(mockDialogRef.close).not.toHaveBeenCalled();

      await fixture.componentInstance.updateAll();

      expect(snackbarMessage()).toBe('Updated email on 2 member records');
      expect(mockDialogRef.close).toHaveBeenCalledTimes(1);
    });

    // updateMemberEmails is a callable, and callables enforce App Check. The
    // help dialog opens over this one, which stays open so the same choice
    // can be retried once the device check passes.
    it('opens the App Check help dialog, and stays open, when the callable is refused for App Check', async () => {
      const openDialog = vi
        .spyOn(TestBed.inject(MatDialog), 'open')
        .mockReturnValue({} as MatDialogRef<unknown>);
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        new FirebaseError('functions/unauthenticated', 'App Check failed')
      );

      await fixture.componentInstance.updateAll();

      expect(openDialog).toHaveBeenCalledWith(
        AppCheckErrorDialogComponent,
        expect.anything()
      );
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('Update old email only', () => {
    beforeEach(async () => {
      await open(3, 1);
    });

    it('passes the old login email as onlyFromEmail', async () => {
      await fixture.componentInstance.updateOldOnly();

      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(OLD);
      expect(snackbarMessage()).toBe('Updated email on 2 member records');
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('is what the Update old email only button calls', async () => {
      fixture.debugElement
        .query(By.css('[data-testid="group-email-update-old-only-button"]'))
        .nativeElement.click();

      await vi.waitFor(() =>
        expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
          OLD
        )
      );
    });

    it('reports a conflict the same way as Update all', async () => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue({
        updated: 0,
        conflicts: 1,
      });

      await fixture.componentInstance.updateOldOnly();

      expect(snackbarMessage()).toBe(
        'No member records were updated. 1 skipped because another member of that group already uses that address.'
      );
    });

    it('shows an error snackbar when the update fails', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue('boom');

      await fixture.componentInstance.updateOldOnly();

      expect(snackbarMessage()).toBe(
        'Something went wrong - could not update member emails'
      );
    });

    it('stays open after a failure, like Update all', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        new Error('offline')
      );

      await fixture.componentInstance.updateOldOnly();

      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  // M6: a session that ends while the dialog is open leaves nothing to update.
  describe('when the session ends', () => {
    beforeEach(async () => {
      await open(3, 1);
    });

    it('closes the dialog when the user signs out while it is open', async () => {
      expect(mockDialogRef.close).not.toHaveBeenCalled();

      userStore.user.set(null);
      await fixture.whenStable();

      expect(mockDialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('closes quietly, without a misleading message, when there is no user to update', async () => {
      userStore.user.set(null);

      await fixture.componentInstance.updateAll();

      expect(mockMemberService.updateAllMemberEmails).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });
  });
});
