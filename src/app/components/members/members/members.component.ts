import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconAnchor, MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { HelpComponent } from '@components/help/help.component';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { SortingService } from '@services/sorting.service';
import { UserService } from '@services/user.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { EditMemberComponent } from '../edit-member/edit-member.component';
import {
  Component,
  computed,
  inject,
  model,
  OnInit,
  signal,
  Signal,
} from '@angular/core';
import {
  MatFormField,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatNoDataRow,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';

@Component({
  selector: 'app-members',
  templateUrl: './members.component.html',
  styleUrl: './members.component.scss',
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    CommonModule,
    MatIconButton,
    MatSuffix,
    MatIcon,
    MatTooltip,
    MatSlideToggle,
    MatTable,
    MatSort,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatSortHeader,
    MatIconAnchor,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    AsyncPipe,
    YesNoPipe,
    ActiveInactivePipe,
  ],
})
export class MembersComponent implements OnInit {
  router = inject(Router);
  userService = inject(UserService);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  sorter = inject(SortingService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);

  #user: Signal<User> = this.userService.user;
  currentMember: Signal<Member> = this.memberService.currentMember;
  #groupMembers: Signal<Member[]> = this.memberService.groupMembers;
  currentGroup: Signal<Group> = this.groupService.currentGroup;

  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);

  activeOnly = model<boolean>(true);
  nameFilter = model<string>('');

  filteredMembers = computed(() => {
    var members = this.#groupMembers().filter((m: Member) => {
      return (
        (m.active || m.active == this.activeOnly()) &&
        m.displayName.toLowerCase().includes(this.nameFilter().toLowerCase())
      );
    });
    if (members.length > 0) {
      members = this.sorter.sort(members, this.sortField(), this.sortAsc());
    }
    return members;
  });

  ngOnInit(): void {}

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'members',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }

  sortMembers(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  onRowClick(member: Member): void {
    if (this.currentMember().groupAdmin || this.#user().id == member.userId) {
      const dialogConfig: MatDialogConfig = {
        data: {
          groupId: this.currentGroup().id,
          userId: this.#user().id,
          isGroupAdmin: this.currentMember().groupAdmin,
          member: member,
        },
      };
      const dialogRef = this.dialog.open(EditMemberComponent, dialogConfig);
      dialogRef.afterClosed().subscribe((result) => {
        if (result.success) {
          this.snackBar.open(`Member ${result.operation}`, 'OK');
        }
      });
    }
  }
}
