import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  linkedSignal,
  signal,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
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
import { MemberLinkService } from '@services/member-link.service';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { DocumentReference } from 'firebase/firestore';
import { AddGroupComponent } from '../add-group/add-group.component';
import { ManageGroupsComponent } from '../manage-groups/manage-groups.component';

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

  readonly #user: Signal<User | null> = this.userStore.user;
  readonly #currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  readonly allUserGroups: Signal<Group[]> = this.groupStore.allUserGroups;
  readonly activeUserGroups: Signal<Group[]> = this.groupStore.activeUserGroups;

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

  addGroup(): void {
    const dialogRef = this.dialog.open(AddGroupComponent);
    dialogRef.afterClosed().subscribe((groupRef: DocumentReference<Group>) => {
      if (groupRef) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Group added' },
        });
      }
    });
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

  manageGroups(): void {
    const dialogConfig: MatDialogConfig = {
      data: { user: this.#user(), group: this.#currentGroup() },
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
