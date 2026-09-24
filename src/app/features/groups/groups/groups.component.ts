import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
  signal,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { GroupService } from '@services/group.service';
import {
  GUIDED_TOUR_DIALOG_CONFIG,
  GuidedTourDialogs,
} from '@services/guided-tour-dialogs';
import { GuidedTourService } from '@services/guided-tour.service';
import { MemberLinkService } from '@services/member-link.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { doc, DocumentReference, getFirestore } from 'firebase/firestore';
import { AddGroupComponent } from '../add-group/add-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';
import { buildGroupsTourSteps } from './groups.tour';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
  imports: [
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    DocRefCompareDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupsComponent {
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly groupService = inject(GroupService);
  protected readonly loading = inject(LoadingService);
  protected readonly memberStore = inject(MemberStore);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly memberLinkService = inject(MemberLinkService);
  protected readonly guidedTour = inject(GuidedTourService);
  protected readonly fs = inject(getFirestore);

  readonly #user: Signal<User | null> = this.userStore.user;
  readonly #currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  readonly allUserGroups: Signal<Group[]> = this.groupStore.allUserGroups;
  readonly activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

  // Sample groups the guided tour shows a user who has none yet. Held here,
  // never in the store, and cleared when the tour ends.
  protected readonly tourSample = signal<Group[] | null>(null);
  protected readonly displayedAllGroups = computed(
    () => this.tourSample() ?? this.allUserGroups()
  );
  protected readonly displayedActiveGroups = computed(
    () => this.tourSample() ?? this.activeUserGroups()
  );
  readonly #tourDialogs = new GuidedTourDialogs<'add' | 'manage'>();

  protected readonly selectedGroupRef =
    linkedSignal<DocumentReference<Group> | null>(
      () => this.groupStore.currentGroup()?.ref ?? null
    );

  // True until the one-time invited-member link attempt has settled -
  // gates the loading overlay below so the page never shows a "no groups" flash for a user who's
  // about to be linked into one. Starts true (not false) precisely so the
  // loading state holds from the very first render, before anything else
  // has had a chance to run.
  protected readonly checkingInvitedMemberLinks = signal(true);
  #inviteLinkAttemptStarted = false;

  constructor() {
    // Leaving the page mid-tour ends it (and clears what it changed)
    inject(DestroyRef).onDestroy(() => this.guidedTour.stop('closed'));

    effect(() => {
      if (this.groupStore.loaded() && !this.checkingInvitedMemberLinks()) {
        this.loading.loadingOff();
      } else {
        this.loading.loadingOn();
      }
    });

    effect(() => {
      // One attempt per page load, regardless of current group count -
      // catches not just a signup-time miss (see MemberLinkService /
      // GroupService.getUserGroups, which already retry that case once)
      // but also an invite that arrived after this account already had
      // other groups, which neither of those cover.
      if (this.#inviteLinkAttemptStarted) return;

      // Read email as a tracked dependency so this waits for the user to
      // actually be known before firing, rather than racing it.
      const email = this.#user()?.email;
      if (email) {
        this.#inviteLinkAttemptStarted = true;
        void this.linkInvitedMembersOnLoad(email);
      }
    });
  }

  private async linkInvitedMembersOnLoad(email: string): Promise<void> {
    try {
      const membersLinked =
        await this.memberLinkService.linkInvitedMembers(email);
      if (membersLinked !== null && membersLinked > 0) {
        this.analytics.logEvent('members_linked', { email, membersLinked });
      }
    } finally {
      this.checkingInvitedMemberLinks.set(false);
    }
  }

  addGroup(forTour = false): MatDialogRef<AddGroupComponent> {
    const dialogRef = this.dialog.open(
      AddGroupComponent,
      forTour ? GUIDED_TOUR_DIALOG_CONFIG : undefined
    );
    dialogRef.afterClosed().subscribe((groupRef: DocumentReference<Group>) => {
      if (groupRef) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Group added' },
        });
      }
    });
    return dialogRef;
  }

  async onSelectGroup(e: MatSelectChange): Promise<void> {
    this.loading.loadingOn();
    try {
      const userRef = this.#user()!.ref!;
      await this.groupService.getGroup(e.value, userRef);
    } finally {
      this.loading.loadingOff();
    }
  }

  /**
   * Opens Manage Groups. For the guided tour, `tour.group` picks which group
   * it opens on, and `tour.sampleGroups` shows sample groups without the
   * dialog reading anything from Firestore.
   */
  manageGroups(tour?: {
    group: Group | null;
    sampleGroups?: Group[];
  }): MatDialogRef<ManageGroupsComponent> {
    const dialogConfig: MatDialogConfig = {
      ...(tour ? GUIDED_TOUR_DIALOG_CONFIG : {}),
      data: {
        user: this.#user(),
        group: tour ? tour.group : this.#currentGroup(),
        tourPreview: tour?.sampleGroups
          ? { groups: tour.sampleGroups }
          : undefined,
      },
    };
    const dialogRef = this.dialog.open(ManageGroupsComponent, dialogConfig);
    dialogRef
      .afterClosed()
      .subscribe((result: { success: boolean; operation: string } | false) => {
        if (result && result.success) {
          let message = 'Group updated';
          switch (result.operation) {
            case 'saved':
              break;
            case 'archived':
              message = 'Group archived';
              break;
            case 'unarchived':
              message = 'Group restored';
              break;
            case 'deleted':
              message = 'Group deleted';
              break;
          }
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message },
          });
        }
      });
    return dialogRef;
  }

  /**
   * Starts the guided tour. A user with no groups sees sample groups; the
   * tour also opens New Group and Manage Groups to walk through them, and
   * puts everything back when it ends.
   */
  startTour(): void {
    const previousSelection = this.selectedGroupRef();
    if (this.allUserGroups().length === 0) {
      const samples = this.#tourSampleGroups();
      this.tourSample.set(samples);
      this.selectedGroupRef.set(samples[0]!.ref!);
    }

    this.guidedTour.start({
      id: 'groups',
      steps: buildGroupsTourSteps({
        usingSample: () => this.tourSample() !== null,
        canManage: () =>
          this.tourSample() !== null ||
          this.groupStore.userAdminGroups().length > 0,
        openAddGroup: () => this.#openTourDialog('add'),
        openManageGroups: () => this.#openTourDialog('manage'),
        closeDialogs: () => this.#tourDialogs.close(),
      }),
      onEnd: () => {
        this.#tourDialogs.close();
        this.tourSample.set(null);
        this.selectedGroupRef.set(previousSelection);
      },
      fullHelp: () => this.showHelp(),
    });
  }

  #tourSampleGroups(): Group[] {
    const sample = (id: string, name: string) =>
      new Group({
        id,
        name,
        active: true,
        archived: false,
        autoAddMembers: true,
        currencyCode: 'USD',
        userActiveInGroup: true,
        userIsAdmin: true,
        // Built locally; the tour never reads or writes it
        ref: doc(this.fs, `groups/${id}`) as DocumentReference<Group>,
      });
    return [
      sample('tour-sample-beach', 'Beach Weekend'),
      sample('tour-sample-roommates', 'Roommates'),
    ];
  }

  #openTourDialog(kind: 'add' | 'manage'): Promise<void> {
    return this.#tourDialogs.open(kind, () => {
      if (kind === 'add') return this.addGroup(true);
      const samples = this.tourSample();
      if (samples) {
        return this.manageGroups({ group: samples[0]!, sampleGroups: samples });
      }
      // Real groups: open on one the user can actually manage
      const adminGroups = this.groupStore.userAdminGroups();
      const current = this.#currentGroup();
      return this.manageGroups({
        group: adminGroups.some((g) => g.id === current?.id)
          ? current
          : (adminGroups[0] ?? null),
      });
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'groups' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
