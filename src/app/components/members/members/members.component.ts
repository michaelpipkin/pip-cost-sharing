import { BreakpointObserver } from '@angular/cdk/layout';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  Signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@shared/components/custom-snackbar/custom-snackbar.component';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { DemoService } from '@services/demo.service';
import { SortingService } from '@services/sorting.service';
import { TourService } from '@services/tour.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import { AddMemberComponent } from '../add-member/add-member.component';
import { EditMemberComponent } from '../edit-member/edit-member.component';

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
    YesNoPipe,
    ActiveInactivePipe,
  ],
})
export class MembersComponent {
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly demoService = inject(DemoService);
  protected readonly tourService = inject(TourService);
  protected readonly sorter = inject(SortingService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly breakpointObserver = inject(BreakpointObserver);

  user: Signal<User> = this.userStore.user;
  currentMember: Signal<Member> = this.memberStore.currentMember;
  #groupMembers: Signal<Member[]> = this.memberStore.groupMembers;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;

  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);
  columnsToDisplay = signal<string[]>([]);

  activeOnly = model<boolean>(true);
  nameFilter = model<string>('');

  filteredMembers = computed(() => {
    var members = this.#groupMembers().filter((m: Member) => {
      return (
        (m.active || m.active == this.activeOnly()) &&
        (m.displayName
          .toLowerCase()
          .includes(this.nameFilter().toLowerCase()) ||
          m.email.toLowerCase().includes(this.nameFilter().toLowerCase()))
      );
    });
    if (members.length > 0) {
      members = this.sorter.sort(members, this.sortField(), this.sortAsc());
    }
    return members;
  });

  constructor() {
    effect(() => {
      if (!this.memberStore.loaded()) {
        this.loading.loadingOn();
      } else {
        this.loading.loadingOff();
      }
    });

    // Observe breakpoint changes for responsive column display
    this.breakpointObserver
      .observe('(max-width: 1009px)')
      .subscribe((result) => {
        if (result.matches) {
          this.columnsToDisplay.set([
            'nameEmail',
            'send',
            'active',
            'groupAdmin',
          ]);
        } else {
          this.columnsToDisplay.set([
            'displayName',
            'email',
            'send',
            'active',
            'groupAdmin',
          ]);
        }
      });

    afterNextRender(() => {
      // Check if we should auto-start the members tour
      this.tourService.checkForContinueTour('members');
    });
  }

  sortMembers(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  addMember(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: {
        groupId: this.currentGroup().id,
      },
    };
    const dialogRef = this.dialog.open(AddMemberComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((result) => {
      if (result.success) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: 'Member added' },
        });
      }
    });
  }

  onRowClick(member: Member): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    if (this.currentMember().groupAdmin || this.user().ref.eq(member.userRef)) {
      const dialogConfig: MatDialogConfig = {
        data: {
          groupId: this.currentGroup().id,
          userId: this.user().id,
          isGroupAdmin: this.currentMember().groupAdmin,
          member: member,
        },
      };
      const dialogRef = this.dialog.open(EditMemberComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((result) => {
        if (!!result && result.success) {
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: `Member ${result.operation}` },
          });
        }
      });
    }
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'members' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    // Force start the Members Tour (ignoring completion state)
    this.tourService.startMembersTour(true);
  }
}
