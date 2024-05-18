import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconAnchor, MatIconButton } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortHeader } from '@angular/material/sort';
import { Router } from '@angular/router';
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
  OnInit,
  signal,
  WritableSignal,
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

  user: WritableSignal<User> = this.userService.user;
  currentMember: WritableSignal<Member> = this.memberService.currentGroupMember;
  groupMembers: WritableSignal<Member[]> = this.memberService.allGroupMembers;
  currentGroup: WritableSignal<Group> = this.groupService.currentGroup;

  activeOnly = signal<boolean>(false);
  nameFilter = signal<string>('');
  sortField = signal<string>('name');
  sortAsc = signal<boolean>(true);

  filteredMembers = computed(() => {
    var members = this.groupMembers().filter((m: Member) => {
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

  nameFilterValue: string = '';

  columnsToDisplay: string[] = [
    'displayName',
    'email',
    'send',
    'active',
    'groupAdmin',
  ];

  ngOnInit(): void {
    if (this.currentGroup() == null) {
      this.router.navigateByUrl('/groups');
    }
  }

  updateSearch() {
    this.nameFilter.set(this.nameFilterValue);
  }

  toggleActive(activeOnly: boolean) {
    this.activeOnly.set(activeOnly);
  }

  sortMembers(e: { active: string; direction: string }): void {
    this.sortField.set(e.active);
    this.sortAsc.set(e.direction == 'asc');
  }

  clearSearch(): void {
    this.nameFilter.set('');
    this.nameFilterValue = '';
  }

  onRowClick(member: Member): void {
    if (this.currentMember().groupAdmin || this.user().id == member.userId) {
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
        if (result.success) {
          this.snackBar.open(`Member ${result.operation}`, 'OK');
        }
      });
    }
  }
}
