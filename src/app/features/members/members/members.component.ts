import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { InviteService } from '@services/invite.service';
import {
  GUIDED_TOUR_DIALOG_CONFIG,
  GuidedTourDialogs,
} from '@services/guided-tour-dialogs';
import { GuidedTourService } from '@services/guided-tour.service';
import { SortingService } from '@services/sorting.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { YesNoCheckPipe } from '@shared/pipes/yes-no-check.pipe';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AddMemberComponent } from '../add-member/add-member.component';
import { EditMemberComponent } from '../edit-member/edit-member.component';
import { buildMembersTourSteps } from './members.tour';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';

// Anti-spam window for invites, mirrored server-side in
// functions/src/index.ts (INVITE_COOLDOWN_MS). This copy is UX only — the
// Cloud Function re-checks the cooldown and is the real gate.
const INVITE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const INVITE_EMAIL_PATTERN = /^[^\s@]+@([^\s@.]+\.)+[^\s@.]{2,}$/;

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatTableModule,
    MatSortModule,
    MatCardModule,
    YesNoCheckPipe,
    ActiveInactivePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersComponent {
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly sorter = inject(SortingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly inviteService = inject(InviteService);
  protected readonly appCheckErrorHandler = inject(AppCheckErrorHandlerService);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  user: Signal<User | null> = this.userStore.user;
  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  // Sample members the guided tour adds when you're the only member. Held
  // here, never in the store, and cleared when the tour ends.
  protected readonly tourSample = signal<Member[] | null>(null);
  groupMembers: Signal<Member[]> = computed(
    () => this.tourSample() ?? this.memberStore.groupMembers()
  );
  readonly #tourDialogs = new GuidedTourDialogs<'add' | 'edit'>();
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;

  sortField = signal<string>('displayName');
  sortAsc = signal<boolean>(true);
  smallScreen = signal<boolean>(false);

  activeOnly = model<boolean>(true);
  nameFilter = model<string>('');

  filteredMembers = computed(() => {
    let members = this.groupMembers().filter((m: Member) => {
      return (
        (!this.activeOnly() || m.active) &&
        (m.displayName
          .toLowerCase()
          .includes(this.nameFilter().toLowerCase()) ||
          (m.email ?? '')
            .toLowerCase()
            .includes(this.nameFilter().toLowerCase()))
      );
    });
    if (members.length > 0) {
      members = this.sorter.sort(members, this.sortField(), this.sortAsc());
    }
    return members;
  });

  protected readonly isGroupAdmin = computed(
    () => this.currentMember()?.groupAdmin ?? false
  );

  /**
   * The Invite column exists only when a *currently visible* member could
   * actually be invited, and only for group admins.
   */
  protected readonly showInviteColumn = computed(
    () =>
      this.isGroupAdmin() &&
      this.filteredMembers().some((m) => this.canInvite(m))
  );

  columnsToDisplay = computed<string[]>(() => {
    const columns = this.smallScreen()
      ? ['nameEmail', 'active', 'groupAdmin']
      : ['displayName', 'email', 'active', 'groupAdmin'];
    return this.showInviteColumn() ? [...columns, 'invite'] : columns;
  });

  constructor() {
    // Leaving the page mid-tour ends it (and clears what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      if (this.memberStore.loaded()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });

    // Observe breakpoint changes for responsive column display
    this.breakpointObserver
      .observe('(max-width: 1009px)')
      .subscribe((result) => this.smallScreen.set(result.matches));
  }

  sortMembers(e: { active: string; direction: string }): void {
    // The mobile "Name / Email" column sorts by name.
    this.sortField.set(e.active === 'nameEmail' ? 'displayName' : e.active);
    this.sortAsc.set(e.direction === 'asc');
  }

  /** Whether the current user can open `member` for editing. */
  canEdit(member: Member): boolean {
    return (
      this.isGroupAdmin() ||
      (!!member.userRef && !!this.user()?.ref?.eq(member.userRef))
    );
  }

  /**
   * A member can be invited when they have never registered, are active,
   * have a plausible email address, and either have never been invited or
   * were last invited at a different address or more than 24 hours ago. The
   * server enforces all of this again in sendGroupInvite; this is UX only.
   */
  canInvite(member: Member): boolean {
    if (member.userRef || !member.active) return false;

    const email = (member.email ?? '').trim();
    if (!INVITE_EMAIL_PATTERN.test(email)) return false;

    const invite = member.invite;
    if (!invite) return true;
    if (invite.lastSentTo?.trim().toLowerCase() !== email.toLowerCase()) {
      return true; // address changed - reset
    }

    return (
      Date.now() - (invite.lastSentAt?.toMillis() ?? 0) >= INVITE_COOLDOWN_MS
    );
  }

  sendInvite(member: Member): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        dialogTitle: 'Send App Invitation',
        confirmationText: `Do you want to send an email to ${member.displayName} inviting them to create an account for this app?`,
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Send',
      },
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (!confirm) return;
      try {
        this.loading.loadingOn();
        await this.inviteService.sendGroupInvite(
          this.currentGroup()!.id,
          member.id
        );
        this.analytics.logEvent('group_invite_sent');
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: `Invitation sent to ${member.email}` },
        });
      } catch (error) {
        this.appCheckErrorHandler.handle(
          error,
          error instanceof Error
            ? error.message
            : 'Something went wrong - could not send invitation'
        );
        if (error instanceof Error) {
          this.analytics.logError(
            'Members Component',
            'send_group_invite',
            'Failed to send group invite',
            error.message
          );
        }
      } finally {
        this.loading.loadingOff();
      }
    });
  }

  addMember(forTour = false): MatDialogRef<AddMemberComponent> {
    const dialogConfig: MatDialogConfig = {
      ...(forTour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      maxWidth: '320px',
      data: {
        groupId: this.currentGroup()!.id,
      },
    };
    const dialogRef = this.dialog.open(AddMemberComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Member added' },
        });
      }
    });
    return dialogRef;
  }

  onRowClick(member: Member): void {
    if (this.canEdit(member)) {
      this.editMember(member);
    }
  }

  editMember(
    member: Member,
    forTour = false
  ): MatDialogRef<EditMemberComponent> {
    const dialogConfig: MatDialogConfig = {
      ...(forTour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      maxWidth: '320px',
      data: {
        groupId: this.currentGroup()!.id,
        userId: this.user()!.id,
        isGroupAdmin: this.currentMember()!.groupAdmin,
        member: member,
      },
    };
    const dialogRef = this.dialog.open(EditMemberComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: `Member ${result.operation}` },
        });
      }
    });
    return dialogRef;
  }

  /**
   * Starts the guided tour. When you're the only member, a few sample
   * members are added; the tour also opens Add and Edit Member to walk
   * through them, and puts everything back when it ends.
   */
  startTour(): void {
    const previousActiveOnly = this.activeOnly();
    const real = this.memberStore.groupMembers();
    if (real.length <= 1) {
      this.tourSample.set([...real, ...this.#tourSampleMembers()]);
    }

    this.guidedTour.start({
      id: 'members',
      steps: buildMembersTourSteps({
        usingSample: () => this.tourSample() !== null,
        isAdmin: () => this.isGroupAdmin(),
        inviteColumnShown: () => this.showInviteColumn(),
        showInactive: () => this.activeOnly.set(false),
        openAddMember: () =>
          this.#tourDialogs.open('add', () => this.addMember(true)),
        openEditMember: () =>
          this.#tourDialogs.open('edit', () =>
            this.editMember(this.#tourEditTarget(), true)
          ),
        closeDialogs: () => this.#tourDialogs.close(),
      }),
      onEnd: () => {
        this.#tourDialogs.close();
        this.tourSample.set(null);
        this.activeOnly.set(previousActiveOnly);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  /** Admins edit someone else (showing Remove); others edit themselves. */
  #tourEditTarget(): Member {
    const self = this.currentMember()!;
    if (!this.isGroupAdmin()) return self;
    return this.groupMembers().find((m) => m.id !== self.id) ?? self;
  }

  #tourSampleMembers(): Member[] {
    const sample = (
      id: string,
      displayName: string,
      options: { active?: boolean; groupAdmin?: boolean; registered?: boolean }
    ) =>
      new Member({
        id,
        displayName,
        email: `${id.replace('tour-sample-', '')}@example.com`,
        active: options.active ?? true,
        groupAdmin: options.groupAdmin ?? false,
        // Built locally; the tour never reads or writes it
        userRef: options.registered
          ? (doc(this.fs, `users/${id}`) as DocumentReference<User>)
          : null,
      });
    return [
      // Not registered yet, so admins see the invite envelope for them
      sample('tour-sample-alex', 'Alex', {}),
      sample('tour-sample-jordan', 'Jordan', {
        groupAdmin: true,
        registered: true,
      }),
      sample('tour-sample-sam', 'Sam', { active: false, registered: true }),
    ];
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'members' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
